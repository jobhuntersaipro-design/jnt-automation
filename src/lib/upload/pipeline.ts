import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
import { prisma } from "@/lib/prisma";
import { updateUploadStatus } from "@/lib/db/upload";
import { parseExcelFromR2 } from "./parser";
import { splitDispatchers } from "./dispatcher-check";
import { calculateSalary } from "./calculator";
import type { SalaryResult, DispatcherRules, WeightTierInput, IncentiveRuleInput, PetrolRuleInput } from "./calculator";
import type { UnknownDispatcher } from "./dispatcher-check";

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

  // 1. Parse Excel from R2
  const rows = await parseExcelFromR2(upload.r2Key);

  if (rows.length === 0) {
    throw new Error("No delivery rows found in the uploaded file");
  }

  // 2. Split known vs unknown
  const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

  // 3. Store metadata for polling endpoint
  const meta: UploadMeta = {
    knownCount: known.length,
    unknownDispatchers: unknown,
  };
  await redis.set(metaKey(uploadId), meta, { ex: 7200 });

  // 4. Set status to CONFIRM_SETTINGS
  await updateUploadStatus(uploadId, "CONFIRM_SETTINGS");
}

// ─── Phase B: Calculate (runs after agent confirms settings) ──────

export async function calculateAfterConfirm(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { branch: { select: { agentId: true } } },
  });

  if (!upload) throw new Error("Upload not found");

  // Re-parse from R2 (avoids storing 100K+ rows in KV which exceeds 10MB limit)
  const rows = await parseExcelFromR2(upload.r2Key);
  const { known, unknown } = await splitDispatchers(rows, upload.branch.agentId);

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

  // Store compact preview in KV (without lineItems to stay under 10MB limit).
  // Line items are re-derived from R2 at confirmation time.
  const compactResults: PreviewResult[] = results.map((r) => ({
    dispatcherId: r.dispatcherId,
    extId: r.extId,
    totalOrders: r.totalOrders,
    baseSalary: r.baseSalary,
    incentive: r.incentive,
    petrolSubsidy: r.petrolSubsidy,
    petrolQualifyingDays: r.petrolQualifyingDays,
    penalty: r.penalty,
    advance: r.advance,
    netSalary: r.netSalary,
    lineItems: [], // omitted — re-parsed from R2 at confirmation
    weightTiersSnapshot: r.weightTiersSnapshot,
    incentiveSnapshot: r.incentiveSnapshot,
    petrolSnapshot: r.petrolSnapshot,
  }));

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

  // Clean up metadata KV
  await redis.del(metaKey(uploadId));
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

  // Load the newly-created dispatchers with their rules
  const dispatchers = await prisma.dispatcher.findMany({
    where: {
      branch: { agentId: upload.branch.agentId },
      extId: { in: unknownExtIds },
    },
    include: {
      weightTiers: { orderBy: { tier: "asc" } },
      incentiveRule: true,
      petrolRule: true,
    },
  });

  // Calculate salary for each new dispatcher
  const newResults: PreviewResult[] = [];
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

    const result = calculateSalary(rules, dispatcherRows);
    newResults.push({
      dispatcherId: result.dispatcherId,
      extId: result.extId,
      totalOrders: result.totalOrders,
      baseSalary: result.baseSalary,
      incentive: result.incentive,
      petrolSubsidy: result.petrolSubsidy,
      petrolQualifyingDays: result.petrolQualifyingDays,
      penalty: result.penalty,
      advance: result.advance,
      netSalary: result.netSalary,
      lineItems: [],
      weightTiersSnapshot: result.weightTiersSnapshot,
      incentiveSnapshot: result.incentiveSnapshot,
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

  // Clean up metadata KV
  await redis.del(metaKey(uploadId));
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
}

export interface PreviewResult {
  dispatcherId: string;
  extId: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: SerializedLineItem[];
  weightTiersSnapshot: WeightTierInput[];
  incentiveSnapshot: IncentiveRuleInput;
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
}

