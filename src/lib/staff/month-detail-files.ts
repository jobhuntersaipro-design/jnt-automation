import { getMonthDetailsBatch, type MonthDetail } from "@/lib/db/staff";
import { runPool } from "@/lib/upload/run-pool";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "./month-detail";
import { generateMonthDetailCsv } from "./month-detail-csv";
import { generateMonthDetailPdf } from "./month-detail-pdf";
import { monthDetailFilename } from "./month-detail-filename";
import { readBonusTierSnapshot } from "./bonus-tier-snapshot";

export interface GeneratedMonthFile {
  fileName: string;
  data: Uint8Array | string;
}

export interface GenerateMonthFilesArgs {
  agentId: string;
  year: number;
  month: number;
  format: "csv" | "pdf";
  /** Optional narrow to a subset of dispatchers (used by QStash fan-out). */
  dispatcherIds?: string[];
  /** Invoked once per successful file — used to update Redis progress. */
  onFile?: (opts: {
    fileName: string;
    dispatcherName: string;
    doneInBatch: number;
  }) => Promise<void> | void;
}

/**
 * Shared core that fetches MonthDetails and generates files (CSV or PDF)
 * for each dispatcher. Extracted from `runBulkExport` so both the inline
 * dev worker and the QStash-fan-out chunk worker can reuse the same
 * generation logic.
 *
 * Returns the list of successfully generated files. Dispatchers whose
 * generation threw are logged and skipped (not fatal to the job).
 */
export async function generateMonthDetailFiles(
  args: GenerateMonthFilesArgs,
): Promise<GeneratedMonthFile[]> {
  const details = await getMonthDetailsBatch(
    args.agentId,
    args.year,
    args.month,
    args.dispatcherIds,
  );
  if (details.length === 0) return [];

  // CPU-bound PDF; string-join CSV. Vercel Lambdas have 2 vCPUs on Hobby,
  // 4 on Pro — so `concurrency=8` for PDF is still limited by physical
  // parallelism, but the higher queue depth keeps the event loop saturated
  // so nothing blocks on Prisma I/O between renders. Fan-out across
  // chunk workers (bulk-export + prewarm) is what delivers real speedup.
  const concurrency = args.format === "pdf" ? 8 : 8;
  let completed = 0;
  const failures: Array<{ extId: string; name: string; error: Error }> = [];

  const raw = await runPool<MonthDetail, GeneratedMonthFile | null>(
    details,
    concurrency,
    async (detail) => {
      try {
        const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
        const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
        const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
        const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);
        const fileName = monthDetailFilename(
          detail.year,
          detail.month,
          detail.dispatcher.name,
          args.format,
        );

        let data: Uint8Array | string;
        if (args.format === "csv") {
          data = generateMonthDetailCsv(detail, tierBreakdown);
        } else {
          const pdf = await generateMonthDetailPdf({
            dispatcher: {
              name: detail.dispatcher.name,
              extId: detail.dispatcher.extId,
              branchCode: detail.dispatcher.branchCode,
            },
            month: detail.month,
            year: detail.year,
            totals: detail.totals,
            orderThreshold: bonusTierSnapshot?.orderThreshold ?? 2000,
            tierBreakdown,
            lineItems: detail.lineItems.map((li) => ({
              deliveryDate: li.deliveryDate,
              waybillNumber: li.waybillNumber,
              weight: li.weight,
              isBonusTier: li.isBonusTier,
            })),
          });
          data = new Uint8Array(pdf);
        }

        completed++;
        if (args.onFile) {
          await args.onFile({
            fileName,
            dispatcherName: detail.dispatcher.name,
            doneInBatch: completed,
          });
        }
        return { fileName, data };
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[month-detail-files] ${args.format} generation failed for ${detail.dispatcher.extId} (${detail.dispatcher.name}):`,
          wrapped,
        );
        failures.push({
          extId: detail.dispatcher.extId,
          name: detail.dispatcher.name,
          error: wrapped,
        });
        completed++;
        return null;
      }
    },
  );

  const successes = raw.filter((f): f is GeneratedMonthFile => f !== null);

  // If every dispatcher failed, fail loudly. Returning [] here would let
  // callers write a 22-byte empty zip to the canonical cache key and keep
  // serving it on every subsequent click until someone invalidates by hand.
  // See docs/audit-results/PDF_LINE_ITEMS_DOWNLOAD_AUDIT.md / the prior
  // 2026-03 incident for the exact failure mode.
  if (successes.length === 0 && failures.length > 0) {
    const first = failures[0];
    throw new Error(
      `All ${failures.length} dispatcher ${args.format.toUpperCase()} file(s) failed to generate. ` +
        `First failure — ${first.name} (${first.extId}): ${first.error.message}`,
    );
  }

  return successes;
}

/**
 * Fetches dispatcher IDs for a month without pulling the full MonthDetail
 * payload. Used by the fan-out dispatcher to decide the chunk plan before
 * workers start. Cheaper than the full join since it's a single indexed
 * projection.
 */
export async function listDispatcherIdsForMonth(
  agentId: string,
  year: number,
  month: number,
): Promise<string[]> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.salaryRecord.findMany({
    where: {
      year,
      month,
      dispatcher: { branch: { agentId } },
    },
    select: { dispatcherId: true, dispatcher: { select: { name: true } } },
    orderBy: { dispatcher: { name: "asc" } },
  });
  return rows.map((r) => r.dispatcherId);
}
