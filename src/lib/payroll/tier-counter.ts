interface TierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface LineItem {
  weight: number;
  commission: number;
  /** True when the parcel was priced at the dispatcher's bonus tier (post-threshold). */
  isBonusTier?: boolean;
}

export interface TierBreakdown {
  tier: number;
  count: number;
  rate: number;
  total: number;
}

function countInternal(
  items: LineItem[],
  tiers: TierSnapshot[],
): TierBreakdown[] {
  const sorted = [...tiers].sort((a, b) => a.tier - b.tier);

  const counters = new Map<number, { count: number; rate: number; total: number }>();
  for (const t of sorted) {
    counters.set(t.tier, { count: 0, rate: t.commission, total: 0 });
  }

  for (const item of items) {
    const tier = sorted.find((t) => {
      const above = item.weight >= t.minWeight;
      const below = t.maxWeight === null || item.weight <= t.maxWeight;
      return above && below;
    });

    if (tier) {
      const counter = counters.get(tier.tier)!;
      counter.count += 1;
      counter.total += item.commission;
    }
  }

  return sorted
    .map((t) => {
      const c = counters.get(t.tier)!;
      return { tier: t.tier, count: c.count, rate: c.rate, total: c.total };
    })
    .filter((t) => t.count > 0);
}

/**
 * Count default-tier parcels (pre-threshold) into the dispatcher's weight tier
 * ranges. Items flagged `isBonusTier === true` are skipped — they belong to the
 * bonus tier and are counted by `countBonusParcelsPerTier` instead.
 *
 * Items with no `isBonusTier` field (historical rows predating the flag) are
 * treated as default-tier for back-compat.
 */
export function countParcelsPerTier(
  lineItems: LineItem[],
  weightTiersSnapshot: TierSnapshot[],
): TierBreakdown[] {
  return countInternal(
    lineItems.filter((li) => li.isBonusTier !== true),
    weightTiersSnapshot,
  );
}

/**
 * Count bonus-tier parcels (post-threshold) into the dispatcher's bonus tier
 * ranges. Only items flagged `isBonusTier === true` participate.
 */
export function countBonusParcelsPerTier(
  lineItems: LineItem[],
  bonusTiersSnapshot: TierSnapshot[],
): TierBreakdown[] {
  return countInternal(
    lineItems.filter((li) => li.isBonusTier === true),
    bonusTiersSnapshot,
  );
}

/**
 * Format rate for payslip: strip trailing zeros after decimal.
 * e.g. 1.10 → "1.1", 2.20 → "2.2", 1.00 → "1", 1.50 → "1.5"
 */
export function formatRate(rate: number): string {
  return parseFloat(rate.toFixed(2)).toString();
}
