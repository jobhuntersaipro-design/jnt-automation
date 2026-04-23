export interface WeightTierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface BonusTierSnapshotRow {
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

export interface TierBreakdown {
  base: TierBreakdownRow[];
  bonusTierEarnings: TierBreakdownRow[];
}

interface BreakdownItem {
  weight: number;
  isBonusTier?: boolean;
}

function formatRange(min: number, max: number | null): string {
  if (max === null) return `${min}+ kg`;
  return `${min}–${max} kg`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split line items into base-tier and bonus-tier breakdowns.
 *
 * Items with `isBonusTier === true` are counted against the bonusTierEarnings tier
 * table (priced at BonusTier rates); everything else falls into the base
 * weight-tier table. If `bonusTiers` is not supplied, the bonusTierEarnings
 * array is always empty — this is the common case for legacy snapshots that
 * pre-date the bonus-tier feature.
 *
 * An item whose weight matches no tier is silently dropped rather than
 * throwing (defensive against malformed snapshots).
 */
export function buildTierBreakdown(
  items: BreakdownItem[],
  weightTiers: WeightTierSnapshot[],
  bonusTiers?: BonusTierSnapshotRow[],
): TierBreakdown {
  const base = emptyRows(weightTiers);
  const bonusTierEarnings = bonusTiers ? emptyRows(bonusTiers) : [];

  const sortedBase = [...weightTiers].sort((a, b) => a.tier - b.tier);
  const sortedBonusTier = bonusTiers
    ? [...bonusTiers].sort((a, b) => a.tier - b.tier)
    : [];

  for (const item of items) {
    if (item.isBonusTier && bonusTiers) {
      fillRow(bonusTierEarnings, sortedBonusTier, item);
    } else {
      fillRow(base, sortedBase, item);
    }
  }

  // The bonusTierEarnings table is only meaningful when some parcel actually landed
  // in it — otherwise the UI would render an empty three-row section for
  // every dispatcher. Drop it when nothing was allocated.
  const hasBonusTierActivity = bonusTierEarnings.some((r) => r.orderCount > 0);
  return { base, bonusTierEarnings: hasBonusTierActivity ? bonusTierEarnings : [] };
}

function emptyRows(tiers: Array<WeightTierSnapshot | BonusTierSnapshotRow>): TierBreakdownRow[] {
  return [...tiers]
    .sort((a, b) => a.tier - b.tier)
    .map((t) => ({
      tier: t.tier,
      range: formatRange(t.minWeight, t.maxWeight),
      commission: t.commission,
      orderCount: 0,
      totalWeight: 0,
      subtotal: 0,
    }));
}

function fillRow(
  rows: TierBreakdownRow[],
  sorted: Array<WeightTierSnapshot | BonusTierSnapshotRow>,
  item: BreakdownItem,
): void {
  const idx = sorted.findIndex(
    (t) =>
      item.weight >= t.minWeight &&
      (t.maxWeight === null || item.weight <= t.maxWeight),
  );
  if (idx === -1) return;
  rows[idx].orderCount += 1;
  rows[idx].totalWeight = round2(rows[idx].totalWeight + item.weight);
  rows[idx].subtotal = round2(rows[idx].subtotal + sorted[idx].commission);
}
