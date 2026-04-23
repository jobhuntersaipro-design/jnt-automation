/**
 * Perf smoke — generate the PDF for the largest dispatcher-month in dev
 * and report wall time + buffer size. Writes the result to /tmp so we
 * can eyeball it.
 *
 *   npx tsx scripts/smoke-pdf-perf.ts
 */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { getMonthDetail } from "../src/lib/db/staff";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "../src/lib/staff/month-detail";
import { readBonusTierSnapshot } from "../src/lib/staff/bonus-tier-snapshot";
import { generateMonthDetailPdf } from "../src/lib/staff/month-detail-pdf";

async function main() {
  // Find the biggest record by totalOrders
  const biggest = await prisma.salaryRecord.findFirst({
    orderBy: { totalOrders: "desc" },
    include: { dispatcher: { select: { id: true, name: true, extId: true, agentId: true } } },
  });
  if (!biggest) {
    console.log("No salary records — nothing to smoke.");
    return;
  }

  if (!biggest.dispatcher.agentId) {
    console.log("Missing agentId on dispatcher — can't load month detail scoped. Aborting.");
    return;
  }

  console.log(
    `Target: ${biggest.dispatcher.name} (${biggest.dispatcher.extId}) · ${biggest.year}-${String(biggest.month).padStart(2, "0")} · ${biggest.totalOrders.toLocaleString()} orders`,
  );

  const detailStart = Date.now();
  const detail = await getMonthDetail(biggest.id, biggest.dispatcher.agentId);
  console.log(`  getMonthDetail: ${Date.now() - detailStart}ms`);
  if (!detail) {
    console.log("  month detail not found — aborting");
    return;
  }

  const weightTiers = ((detail.weightTiersSnapshot ?? []) as unknown) as WeightTierSnapshot[];
  const bonusTierSnapshot = readBonusTierSnapshot(detail.bonusTierSnapshot);
  const bonusTiers = (bonusTierSnapshot?.tiers ?? undefined) as BonusTierSnapshotRow[] | undefined;
  const tierBreakdown = buildTierBreakdown(detail.lineItems, weightTiers, bonusTiers);

  const pdfStart = Date.now();
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
  const pdfMs = Date.now() - pdfStart;

  const out = `/tmp/smoke-pdf-${detail.dispatcher.extId}-${detail.year}-${detail.month}.pdf`;
  await writeFile(out, pdf);

  console.log(`  generateMonthDetailPdf: ${pdfMs}ms  (${(pdf.length / 1024).toFixed(1)} KB)`);
  console.log(`  wrote: ${out}`);
  console.log(`  ${detail.lineItems.length} line items → ${(detail.lineItems.length / (pdfMs / 1000)).toFixed(0)} rows/sec`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
