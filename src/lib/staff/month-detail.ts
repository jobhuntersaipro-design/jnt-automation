export interface WeightTierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface TierBreakdownRow {
  tier: number;
  range: string;
  commission: number;
  orderCount: number;
  totalWeight: number;
  subtotal: number;
}

function formatRange(min: number, max: number | null): string {
  if (max === null) return `${min}+ kg`;
  return `${min}–${max} kg`;
}

/**
 * Count line items per weight tier based on a snapshot of the dispatcher's
 * tiers at the time the salary record was saved.
 *
 * A line item belongs to the first tier whose [minWeight, maxWeight] range
 * contains its weight. maxWeight === null means "open upper bound" and
 * typically applies to the last tier.
 *
 * An item whose weight sits above every defined tier's maxWeight (malformed
 * snapshot — no open upper bound) is silently dropped rather than throwing.
 */
export function buildTierBreakdown(
  items: { weight: number }[],
  tiers: WeightTierSnapshot[],
): TierBreakdownRow[] {
  const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
  const rows: TierBreakdownRow[] = sorted.map((t) => ({
    tier: t.tier,
    range: formatRange(t.minWeight, t.maxWeight),
    commission: t.commission,
    orderCount: 0,
    totalWeight: 0,
    subtotal: 0,
  }));

  for (const item of items) {
    const idx = sorted.findIndex(
      (t) => item.weight >= t.minWeight && (t.maxWeight === null || item.weight <= t.maxWeight),
    );
    if (idx === -1) continue;
    rows[idx].orderCount += 1;
    rows[idx].totalWeight = round2(rows[idx].totalWeight + item.weight);
    rows[idx].subtotal = round2(rows[idx].subtotal + sorted[idx].commission);
  }

  return rows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
