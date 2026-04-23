import type { BonusTierInput } from "@/lib/upload/calculator";

/**
 * Discriminated reader for `SalaryRecord.bonusTierSnapshot`.
 *
 * Two shapes exist in the database:
 *
 * 1. **Legacy** — pre-bonus-tiers feature, the flat-amount model:
 *    `{ orderThreshold, incentiveAmount }`
 *
 * 2. **New** — per-parcel weight-tier model that kicks in post-threshold:
 *    `{ orderThreshold, tiers: [{ tier, minWeight, maxWeight, commission }] }`
 *
 * Callers should branch on `tiers` (null = legacy) or `legacyAmount`.
 */
export interface BonusTierSnapshotRead {
  orderThreshold: number;
  tiers: BonusTierInput[] | null;
  legacyAmount: number | null;
}

export function readBonusTierSnapshot(
  snapshot: unknown,
): BonusTierSnapshotRead | null {
  if (snapshot === null || snapshot === undefined) return null;

  if (typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error(
      `Malformed bonus tier snapshot: expected object, got ${Array.isArray(snapshot) ? "array" : typeof snapshot}`,
    );
  }

  const obj = snapshot as Record<string, unknown>;

  if (typeof obj.orderThreshold !== "number") {
    throw new Error("Malformed bonus tier snapshot: missing orderThreshold");
  }

  const orderThreshold = obj.orderThreshold;

  if (Array.isArray(obj.tiers)) {
    return {
      orderThreshold,
      tiers: obj.tiers as BonusTierInput[],
      legacyAmount: null,
    };
  }

  if (typeof obj.incentiveAmount === "number") {
    return {
      orderThreshold,
      tiers: null,
      legacyAmount: obj.incentiveAmount,
    };
  }

  throw new Error(
    "Malformed bonus tier snapshot: must have either `tiers` array or `incentiveAmount` number",
  );
}
