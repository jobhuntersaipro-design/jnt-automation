import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
import { prisma } from "@/lib/prisma";
import { updateUploadStatus } from "@/lib/db/upload";
import { parseExcelFromR2 } from "./parser";
import { splitDispatchers } from "./dispatcher-check";
import { calculateSalary } from "./calculator";
import type {
  SalaryResult,
  DispatcherRules,
  WeightTierInput,
  BonusTierSnapshot,
  PetrolRuleInput,
} from "./calculator";
import type { UnknownDispatcher } from "./dispatcher-check";
import {
  setProgress,
  clearProgress,
  throttledProgressWriter,
} from "./progress";

/** KV key for parsing metadata (dispatcher counts). TTL = 2 hours. */
const metaKey = (uploadId: string) => `meta:${uploadId}`;
/** KV key for preview data (Phase B output, before confirmation). TTL = 2 hours. */
const previewKey = (uploadId: string) => `preview:${uploadId}`;

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

  const startedAt = Date.now();

  // 1. Parse Excel from R2 — with row-level progress callback
  await setProgress(uploadId, {
    stage: "parse",
    stageLabel: "Parsing Excel file",
    rowsParsed: 0,
    startedAt,
  });

  const writeProgress = throttledProgressWriter(uploadId, 500);
  const rows = await parseExcelFromR2(upload.r2Key, (rowsParsed) => {
    writeProgress({
      stage: "parse",
      stageLabel: "Parsing Excel file",
      rowsParsed,
      startedAt,
    });
  });

  if (rows.length === 0) {
    throw new Error("No delivery rows found in the uploaded file");
  }

  // 2. Split known vs unknown
  await setProgress(uploadId, {
    stage: "split",
    stageLabel: "Matching dispatchers",
    rowsParsed: rows.length,
    startedAt,
  });

  const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

  // 3. Store metadata for polling endpoint
  const meta: UploadMeta = {
    knownCount: known.length,
    unknownDispatchers: unknown,
  };
  await redis.set(metaKey(uploadId), meta, { ex: 7200 });

  // 4. If there are no unknown dispatchers, skip the review step entirely
  //    and run Phase B (calculate) inline. Otherwise stop at CONFIRM_SETTINGS
  //    so the agent can set up the new dispatchers.
  if (unknown.length === 0) {
    await calculateAfterConfirm(uploadId);
    return;
  }

  await updateUploadStatus(uploadId, "CONFIRM_SETTINGS");
  await clearProgress(uploadId);
}

// ─── Phase B: Calculate (runs after agent confirms settings) ──────

export async function calculateAfterConfirm(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { branch: { select: { agentId: true } } },
  });

  if (!upload) throw new Error("Upload not found");

  const startedAt = Date.now();
  await setProgress(uploadId, {
    stage: "parse",
    stageLabel: "Re-parsing Excel file",
    rowsParsed: 0,
    startedAt,
  });

  // Re-parse from R2 (avoids storing 100K+ rows in KV which exceeds 10MB limit)
  const writeProgress = throttledProgressWriter(uploadId, 500);
  const rows = await parseExcelFromR2(upload.r2Key, (rowsParsed) => {
    writeProgress({
      stage: "parse",
      stageLabel: "Re-parsing Excel file",
      rowsParsed,
      startedAt,
    });
  });

  await setProgress(uploadId, {
    stage: "split",
    stageLabel: "Matching dispatchers",
    rowsParsed: rows.length,
    startedAt,
  });
  const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

  // Load dispatchers via their DispatcherAssignment for THIS upload's branch.
  // Going through the assignment table is correct post-Phase-B: a person's
  // branch-specific extId lives on the assignment row, not on Dispatcher.
  const assignments = await prisma.dispatcherAssignment.findMany({
    where: {
      branchId: upload.branchId,
      extId: { in: known },
    },
    include: {
      dispatcher: {
        include: {
          weightTiers: { orderBy: { tier: "asc" } },
          incentiveRule: true,
          bonusTiers: { orderBy: { tier: "asc" } },
          petrolRule: true,
        },
      },
    },
  });

  await setProgress(uploadId, {
    stage: "calculate",
    stageLabel: "Calculating salaries",
    rowsParsed: rows.length,
    dispatchersFound: assignments.length,
    dispatchersProcessed: 0,
    totalDispatchers: assignments.length,
    startedAt,
  });

  // Calculate salary for each known dispatcher
  const results: SalaryResult[] = [];
  let processed = 0;
  for (const a of assignments) {
    const d = a.dispatcher;
    if (!d.incentiveRule || !d.petrolRule) {
      processed++;
      continue;
    }

    const dispatcherRows = rows.filter((r) => r.dispatcherId === a.extId);
    processed++;
    if (dispatcherRows.length === 0) continue;

    const rules: DispatcherRules = {
      dispatcherId: d.id,
      extId: a.extId,
      weightTiers: d.weightTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      incentiveRule: {
        orderThreshold: d.incentiveRule.orderThreshold,
      },
      bonusTiers: d.bonusTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      petrolRule: {
        isEligible: d.petrolRule.isEligible,
        dailyThreshold: d.petrolRule.dailyThreshold,
        subsidyAmount: d.petrolRule.subsidyAmount,
      },
    };

    results.push(calculateSalary(rules, dispatcherRows));

    if (processed % 5 === 0 || processed === assignments.length) {
      await setProgress(uploadId, {
        stage: "calculate",
        stageLabel: "Calculating salaries",
        rowsParsed: rows.length,
        dispatchersFound: assignments.length,
        dispatchersProcessed: processed,
        totalDispatchers: assignments.length,
        startedAt,
      });
    }
  }

  // Store compact preview in KV (without lineItems to stay under 10MB limit).
  // Line items are re-derived from R2 at confirmation time.
  const compactResults: PreviewResult[] = results.map((r) => ({
    dispatcherId: r.dispatcherId,
    extId: r.extId,
    totalOrders: r.totalOrders,
    baseSalary: r.baseSalary,
    bonusTierEarnings: r.bonusTierEarnings,
    petrolSubsidy: r.petrolSubsidy,
    petrolQualifyingDays: r.petrolQualifyingDays,
    penalty: r.penalty,
    advance: r.advance,
    netSalary: r.netSalary,
    lineItems: [], // omitted — re-parsed from R2 at confirmation
    weightTiersSnapshot: r.weightTiersSnapshot,
    bonusTierSnapshot: r.bonusTierSnapshot,
    petrolSnapshot: r.petrolSnapshot,
  }));

  await setProgress(uploadId, {
    stage: "save",
    stageLabel: "Saving preview",
    rowsParsed: rows.length,
    dispatchersFound: assignments.length,
    dispatchersProcessed: assignments.length,
    totalDispatchers: assignments.length,
    startedAt,
  });

  await redis.set(
    previewKey(uploadId),
    { results: compactResults, unknownDispatchers: unknown },
    { ex: 7200 },
  );

  // Set status based on whether there are unknown dispatchers
  const hasUnknown = unknown.length > 0;
  await updateUploadStatus(
    uploadId,
    hasUnknown ? "NEEDS_ATTENTION" : "READY_TO_CONFIRM",
  );

  // Clean up metadata KV + progress
  await redis.del(metaKey(uploadId));
  await clearProgress(uploadId);
}

// ─── Process Unknown (runs after agent sets up new dispatchers) ──

/**
 * Calculate salary only for previously-unknown dispatchers,
 * then merge results into the existing KV preview.
 */
export async function processUnknown(uploadId: string, unknownExtIds: string[]) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { branch: { select: { agentId: true } } },
  });

  if (!upload) throw new Error("Upload not found");

  // Re-parse from R2
  const rows = await parseExcelFromR2(upload.r2Key);

  // Load the newly-created dispatchers via DispatcherAssignment for this
  // upload's branch — assignment carries the branch-specific extId.
  const assignments = await prisma.dispatcherAssignment.findMany({
    where: {
      branchId: upload.branchId,
      extId: { in: unknownExtIds },
    },
    include: {
      dispatcher: {
        include: {
          weightTiers: { orderBy: { tier: "asc" } },
          incentiveRule: true,
          bonusTiers: { orderBy: { tier: "asc" } },
          petrolRule: true,
        },
      },
    },
  });

  // Calculate salary for each new dispatcher
  const newResults: PreviewResult[] = [];
  for (const a of assignments) {
    const d = a.dispatcher;
    if (!d.incentiveRule || !d.petrolRule) continue;

    const dispatcherRows = rows.filter((r) => r.dispatcherId === a.extId);
    if (dispatcherRows.length === 0) continue;

    const rules: DispatcherRules = {
      dispatcherId: d.id,
      extId: a.extId,
      weightTiers: d.weightTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      incentiveRule: {
        orderThreshold: d.incentiveRule.orderThreshold,
      },
      bonusTiers: d.bonusTiers.map((t) => ({
        tier: t.tier,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        commission: t.commission,
      })),
      petrolRule: {
        isEligible: d.petrolRule.isEligible,
        dailyThreshold: d.petrolRule.dailyThreshold,
        subsidyAmount: d.petrolRule.subsidyAmount,
      },
    };

    const result = calculateSalary(rules, dispatcherRows);
    newResults.push({
      dispatcherId: result.dispatcherId,
      extId: result.extId,
      totalOrders: result.totalOrders,
      baseSalary: result.baseSalary,
      bonusTierEarnings: result.bonusTierEarnings,
      petrolSubsidy: result.petrolSubsidy,
      petrolQualifyingDays: result.petrolQualifyingDays,
      penalty: result.penalty,
      advance: result.advance,
      netSalary: result.netSalary,
      lineItems: [],
      weightTiersSnapshot: result.weightTiersSnapshot,
      bonusTierSnapshot: result.bonusTierSnapshot,
      petrolSnapshot: result.petrolSnapshot,
    });
  }

  // Merge with existing preview data
  const existing = await getPreviewData(uploadId);
  const mergedResults = existing
    ? [...existing.results, ...newResults]
    : newResults;

  await redis.set(
    previewKey(uploadId),
    { results: mergedResults, unknownDispatchers: [] },
    { ex: 7200 },
  );

  // Update status
  await updateUploadStatus(uploadId, "READY_TO_CONFIRM");

  // Clean up metadata KV + progress
  await redis.del(metaKey(uploadId));
  await clearProgress(uploadId);
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

// ─── Preview KV helpers ─────────────────────────────────────────

export interface SerializedLineItem {
  waybillNumber: string;
  weight: number;
  commission: number;
  deliveryDate: string | null;
  isBonusTier: boolean;
}

export interface PreviewResult {
  dispatcherId: string;
  extId: string;
  totalOrders: number;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: SerializedLineItem[];
  weightTiersSnapshot: WeightTierInput[];
  bonusTierSnapshot: BonusTierSnapshot;
  petrolSnapshot: PetrolRuleInput;
}

export interface PreviewData {
  results: PreviewResult[];
  unknownDispatchers: UnknownDispatcher[];
}

/**
 * Get preview data from KV. Returns null if expired.
 */
export async function getPreviewData(
  uploadId: string,
): Promise<PreviewData | null> {
  return redis.get<PreviewData>(previewKey(uploadId));
}

/**
 * Update preview data in KV (e.g. after penalty/advance edits).
 */
export async function updatePreviewData(
  uploadId: string,
  data: PreviewData,
): Promise<void> {
  await redis.set(previewKey(uploadId), data, { ex: 7200 });
}

/**
 * Delete preview data from KV (after confirmation).
 */
export async function deletePreviewData(
  uploadId: string,
): Promise<void> {
  await redis.del(previewKey(uploadId));
}

/**
 * Delete all KV data for an upload (meta + preview).
 * Used when cancelling/deleting an upload.
 */
export async function deleteUploadData(
  uploadId: string,
): Promise<void> {
  await redis.del(metaKey(uploadId), previewKey(uploadId));
  await clearProgress(uploadId);
}

