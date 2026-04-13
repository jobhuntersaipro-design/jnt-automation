interface WeightTierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface LineItem {
  weight: number;
  commission: number;
}

export interface TierBreakdown {
  tier: number;
  count: number;
  rate: number;
  total: number;
}

/**
 * Count parcels per weight tier from salary line items.
 * Uses the weightTiersSnapshot to determine tier boundaries.
 * Returns tier breakdowns for the payslip addition section.
 */
export function countParcelsPerTier(
  lineItems: LineItem[],
  weightTiersSnapshot: WeightTierSnapshot[],
): TierBreakdown[] {
  const tiers = [...weightTiersSnapshot].sort((a, b) => a.tier - b.tier);

  const counters = new Map<number, { count: number; rate: number; total: number }>();
  for (const t of tiers) {
    counters.set(t.tier, { count: 0, rate: t.commission, total: 0 });
  }

  for (const item of lineItems) {
    // Find matching tier by weight range
    const tier = tiers.find((t) => {
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

  return tiers
    .map((t) => {
      const c = counters.get(t.tier)!;
      return {
        tier: t.tier,
        count: c.count,
        rate: c.rate,
        total: c.total,
      };
    })
    .filter((t) => t.count > 0);
}

/**
 * Format rate for payslip: strip trailing zeros after decimal.
 * e.g. 1.10 → "1.1", 2.20 → "2.2", 1.00 → "1", 1.50 → "1.5"
 */
export function formatRate(rate: number): string {
  return parseFloat(rate.toFixed(2)).toString();
}
