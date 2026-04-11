import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
import { prisma } from "@/lib/prisma";
import { updateUploadStatus } from "@/lib/db/upload";
import { parseExcelFromR2 } from "./parser";
import { splitDispatchers } from "./dispatcher-check";
import { calculateSalary } from "./calculator";
import type { ParsedRow } from "./parser";
import type { SalaryResult, DispatcherRules } from "./calculator";
import type { UnknownDispatcher } from "./dispatcher-check";

/** KV key for parsed data (Phase A output). TTL = 2 hours. */
const parsedKey = (uploadId: string) => `parsed:${uploadId}`;
/** KV key for parsing metadata (dispatcher counts). TTL = 2 hours. */
const metaKey = (uploadId: string) => `meta:${uploadId}`;

export interface UploadMeta {
  knownCount: number;
  unknownDispatchers: UnknownDispatcher[];
}

// ─── Phase A: Parse + Split (runs in QStash worker) ──────────────

export async function processUpload(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { branch: { select: { agentId: true, code: true } } },
  });

  if (!upload) throw new Error("Upload not found");

  // 1. Parse Excel from R2
  const rows = await parseExcelFromR2(upload.r2Key);

  if (rows.length === 0) {
    throw new Error("No delivery rows found in the uploaded file");
  }

  // 2. Split known vs unknown
  const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

  // 3. Store parsed rows + split in KV for Phase B
  await redis.set(parsedKey(uploadId), { rows, known, unknown }, { ex: 7200 });

  // 4. Store metadata separately for polling endpoint
  const meta: UploadMeta = {
    knownCount: known.length,
    unknownDispatchers: unknown,
  };
  await redis.set(metaKey(uploadId), meta, { ex: 7200 });

  // 5. Set status to CONFIRM_SETTINGS
  await updateUploadStatus(uploadId, "CONFIRM_SETTINGS");
}

// ─── Phase B: Calculate (runs after agent confirms settings) ──────

export async function calculateAfterConfirm(uploadId: string) {
  const cached = await redis.get<{
    rows: ParsedRow[];
    known: string[];
    unknown: UnknownDispatcher[];
  }>(parsedKey(uploadId));

  if (!cached) {
    throw new Error("Parsed data expired. Please re-upload the file.");
  }

  const { rows, known, unknown } = cached;

  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { branch: { select: { agentId: true } } },
  });

  if (!upload) throw new Error("Upload not found");

  // Load dispatchers with their salary rules
  const dispatchers = await prisma.dispatcher.findMany({
    where: {
      branch: { agentId: upload.branch.agentId },
      extId: { in: known },
    },
    include: {
      weightTiers: { orderBy: { tier: "asc" } },
      incentiveRule: true,
      petrolRule: true,
    },
  });

  // Calculate salary for each known dispatcher
  const results: SalaryResult[] = [];
  for (const d of dispatchers) {
    if (!d.incentiveRule || !d.petrolRule) continue;

    const dispatcherRows = rows.filter((r) => r.dispatcherId === d.extId);
    if (dispatcherRows.length === 0) continue;

    const rules: DispatcherRules = {
      dispatcherId: d.id,
      extId: d.extId,
      weightTiers: d.weightTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      incentiveRule: {
        orderThreshold: d.incentiveRule.orderThreshold,
        incentiveAmount: d.incentiveRule.incentiveAmount,
      },
      petrolRule: {
        isEligible: d.petrolRule.isEligible,
        dailyThreshold: d.petrolRule.dailyThreshold,
        subsidyAmount: d.petrolRule.subsidyAmount,
      },
    };

    results.push(calculateSalary(rules, dispatcherRows));
  }

  // Save salary records + line items in a transaction
  await prisma.$transaction(async (tx) => {
    // Delete any existing salary records for this upload (idempotent re-run)
    await tx.salaryRecord.deleteMany({ where: { uploadId } });

    // Create salary records (without nested lineItems to avoid N+1)
    const created = await Promise.all(
      results.map((result) =>
        tx.salaryRecord.create({
          data: {
            dispatcherId: result.dispatcherId,
            uploadId,
            month: upload.month,
            year: upload.year,
            totalOrders: result.totalOrders,
            baseSalary: result.baseSalary,
            incentive: result.incentive,
            petrolSubsidy: result.petrolSubsidy,
            penalty: result.penalty,
            advance: result.advance,
            netSalary: result.netSalary,
            weightTiersSnapshot: JSON.parse(JSON.stringify(result.weightTiersSnapshot)),
            incentiveSnapshot: JSON.parse(JSON.stringify(result.incentiveSnapshot)),
            petrolSnapshot: JSON.parse(JSON.stringify(result.petrolSnapshot)),
          },
          select: { id: true, dispatcherId: true },
        }),
      ),
    );

    // Bulk-insert all line items in one createMany call
    const recordIdByDispatcher = new Map(
      created.map((r) => [r.dispatcherId, r.id]),
    );

    const allLineItems = results.flatMap((result) => {
      const salaryRecordId = recordIdByDispatcher.get(result.dispatcherId);
      if (!salaryRecordId) return [];
      return result.lineItems.map((li) => ({
        salaryRecordId,
        waybillNumber: li.waybillNumber,
        weight: li.weight,
        commission: li.commission,
        deliveryDate: li.deliveryDate,
      }));
    });

    if (allLineItems.length > 0) {
      await tx.salaryLineItem.createMany({ data: allLineItems });
    }
  });

  // Set final status
  if (unknown.length > 0) {
    await updateUploadStatus(uploadId, "NEEDS_ATTENTION");
  } else {
    await updateUploadStatus(uploadId, "SAVED");
  }

  // Clean up KV
  await Promise.all([
    redis.del(parsedKey(uploadId)),
    redis.del(metaKey(uploadId)),
  ]);
}

/**
 * Get parsing metadata for a given upload (dispatcher counts).
 * Returns null if not found or expired.
 */
export async function getUploadMeta(
  uploadId: string,
): Promise<UploadMeta | null> {
  return redis.get<UploadMeta>(metaKey(uploadId));
}
