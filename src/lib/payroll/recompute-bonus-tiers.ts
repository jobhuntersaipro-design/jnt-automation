/**
 * Pure helper powering both the recompute-bonus-tiers script and the
 * per-record recalculate API route. Given a record's line items + current
 * rule config, produces the new base/bonusTierEarnings/net totals and the set of
 * line-item updates needed to bring them in sync.
 *
 * Mirrors `calculateSalary` in `@/lib/upload/calculator` but operates on
 * already-persisted `SalaryLineItem` rows (keyed by DB id) rather than
 * freshly-parsed `ParsedRow`s. Ordering rules are identical so recomputes
 * agree with the initial calculation.
 */

export interface TierConfig {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface RecomputeLineItem {
  id: string;
  waybillNumber: string;
  weight: number;
  deliveryDate: Date | null;
  commission: number;
  isBonusTier: boolean;
}

export interface RecomputeInput {
  lineItems: RecomputeLineItem[];
  weightTiers: TierConfig[];
  bonusTiers: TierConfig[];
  orderThreshold: number;
  /** Preserved from the existing record — not recomputed here. */
  petrolSubsidy: number;
  penalty: number;
  advance: number;
}

export interface LineItemUpdate {
  id: string;
  commission: number;
  isBonusTier: boolean;
}

export interface RecomputeResult {
  baseSalary: number;
  bonusTierEarnings: number;
  netSalary: number;
  /** One entry per input line item — use to rebuild UI / verify math. */
  lineItemUpdates: LineItemUpdate[];
  /** Subset of `lineItemUpdates` whose commission or isBonusTier changed. */
  changedLineItemUpdates: LineItemUpdate[];
}

function commissionFor(weight: number, tiers: TierConfig[]): number {
  const tier = tiers.find(
    (t) =>
      weight >= t.minWeight &&
      (t.maxWeight === null || weight <= t.maxWeight),
  );
  return tier?.commission ?? 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function recomputeRecordForBonusTiers(
  input: RecomputeInput,
): RecomputeResult {
  const { lineItems, weightTiers, bonusTiers, orderThreshold } = input;

  // Stable sort: deliveryDate asc (null last), waybill asc as tiebreaker.
  const sorted = [...lineItems].sort((a, b) => {
    const aT = a.deliveryDate ? a.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    const bT = b.deliveryDate ? b.deliveryDate.getTime() : Number.POSITIVE_INFINITY;
    if (aT !== bT) return aT - bT;
    return a.waybillNumber.localeCompare(b.waybillNumber);
  });

  let baseSalary = 0;
  let bonusTierEarnings = 0;
  const updates: LineItemUpdate[] = [];
  const changed: LineItemUpdate[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const li = sorted[i];
    const isBonusTier = orderThreshold > 0 && i >= orderThreshold;
    const commission = commissionFor(
      li.weight,
      isBonusTier ? bonusTiers : weightTiers,
    );
    if (isBonusTier) bonusTierEarnings += commission;
    else baseSalary += commission;

    const update: LineItemUpdate = { id: li.id, commission, isBonusTier };
    updates.push(update);

    if (li.commission !== commission || li.isBonusTier !== isBonusTier) {
      changed.push(update);
    }
  }

  const netSalary =
    baseSalary + bonusTierEarnings + input.petrolSubsidy - input.penalty - input.advance;

  return {
    baseSalary: round2(baseSalary),
    bonusTierEarnings: round2(bonusTierEarnings),
    netSalary: round2(netSalary),
    lineItemUpdates: updates,
    changedLineItemUpdates: changed,
  };
}
