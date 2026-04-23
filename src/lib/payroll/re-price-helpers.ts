import type { BonusTierInput, PetrolRuleInput, WeightTierInput } from "@/lib/upload/calculator";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";

export interface DispatcherRules {
  weightTiers: WeightTierInput[];
  bonusTiers: BonusTierInput[];
  orderThreshold: number;
  petrol: PetrolRuleInput;
}

export interface RecordSnapshots {
  weightTiersSnapshot: unknown;
  bonusTierSnapshot: unknown;
  petrolSnapshot: unknown;
}

interface TierRow {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

function tiersEqual(a: TierRow[], b: TierRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].tier !== b[i].tier ||
      a[i].minWeight !== b[i].minWeight ||
      a[i].maxWeight !== b[i].maxWeight ||
      a[i].commission !== b[i].commission
    ) {
      return false;
    }
  }
  return true;
}

/**
 * True when the dispatcher's *current* salary rules exactly match the
 * snapshot persisted on their SalaryRecord — meaning a fresh reprice would
 * produce identical line-item commissions. Lets the bulk recalculate route
 * skip the expensive reprice + line-item scan for untouched dispatchers.
 *
 * Returns false conservatively: null snapshots, legacy bonus snapshot shape,
 * or any field drift all force a full reprice.
 */
export function rulesMatchSnapshot(current: DispatcherRules, saved: RecordSnapshots): boolean {
  if (saved.weightTiersSnapshot == null) return false;
  if (saved.bonusTierSnapshot == null) return false;
  if (saved.petrolSnapshot == null) return false;

  if (!Array.isArray(saved.weightTiersSnapshot)) return false;
  if (!tiersEqual(current.weightTiers as TierRow[], saved.weightTiersSnapshot as TierRow[])) {
    return false;
  }

  let bonus: ReturnType<typeof readBonusTierSnapshot>;
  try {
    bonus = readBonusTierSnapshot(saved.bonusTierSnapshot);
  } catch {
    return false;
  }
  if (!bonus || bonus.tiers === null) return false;
  if (bonus.orderThreshold !== current.orderThreshold) return false;
  if (!tiersEqual(current.bonusTiers as TierRow[], bonus.tiers as TierRow[])) return false;

  const saveP = saved.petrolSnapshot as Partial<PetrolRuleInput>;
  if (
    saveP.isEligible !== current.petrol.isEligible ||
    saveP.dailyThreshold !== current.petrol.dailyThreshold ||
    saveP.subsidyAmount !== current.petrol.subsidyAmount
  ) {
    return false;
  }

  return true;
}

/**
 * Groups changed line items by (commission, isBonusTier) so the caller can
 * issue one `updateMany` per bucket instead of deleting + re-inserting every
 * row. A dispatcher has at most `weight_tiers × 2 (base/bonus) = 6` buckets,
 * which collapses N sequential updates into a tiny, fixed set of round trips.
 */
export function bucketLineItemChanges<
  T extends { id: string; commission: number; isBonusTier: boolean },
>(
  original: T[],
  repriced: { commission: number; isBonusTier: boolean }[],
): Array<{ commission: number; isBonusTier: boolean; ids: string[] }> {
  const buckets = new Map<string, { commission: number; isBonusTier: boolean; ids: string[] }>();
  for (let i = 0; i < original.length; i++) {
    const o = original[i];
    const r = repriced[i];
    if (o.commission === r.commission && o.isBonusTier === r.isBonusTier) continue;
    const key = `${r.commission}|${r.isBonusTier}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { commission: r.commission, isBonusTier: r.isBonusTier, ids: [] };
      buckets.set(key, bucket);
    }
    bucket.ids.push(o.id);
  }
  return Array.from(buckets.values());
}
