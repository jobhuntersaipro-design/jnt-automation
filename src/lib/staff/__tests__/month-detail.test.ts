import { describe, it, expect } from "vitest";
import {
  buildTierBreakdown,
  type BonusTierSnapshotRow,
  type WeightTierSnapshot,
} from "../month-detail";

const DEFAULT_TIERS: WeightTierSnapshot[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

const DEFAULT_BONUS_TIERS: BonusTierSnapshotRow[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

describe("buildTierBreakdown", () => {
  it("counts line items and computes subtotals across all three tiers (base only)", () => {
    const items = [
      { weight: 0.5 }, { weight: 1.0 }, { weight: 4.99 }, // tier 1 ×3
      { weight: 6 }, { weight: 10 }, // tier 2 ×2
      { weight: 15 }, // tier 3 ×1
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS);

    expect(out.base).toHaveLength(3);
    expect(out.bonusTierEarnings).toEqual([]);
    expect(out.base[0]).toMatchObject({
      tier: 1,
      range: "0–5 kg",
      commission: 1.0,
      orderCount: 3,
      totalWeight: 6.49,
      subtotal: 3.0,
    });
    expect(out.base[1]).toMatchObject({
      tier: 2,
      range: "5.01–10 kg",
      commission: 1.4,
      orderCount: 2,
      totalWeight: 16,
      subtotal: 2.8,
    });
    expect(out.base[2]).toMatchObject({
      tier: 3,
      range: "10.01+ kg",
      commission: 2.2,
      orderCount: 1,
      totalWeight: 15,
      subtotal: 2.2,
    });
  });

  it("puts exactly 5.00 in tier 1 (inclusive upper) and 5.01 in tier 2 (edge boundary)", () => {
    const items = [
      { weight: 5.0 },  // tier 1
      { weight: 5.01 }, // tier 2
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS);
    expect(out.base[0].orderCount).toBe(1);
    expect(out.base[1].orderCount).toBe(1);
    expect(out.base[2].orderCount).toBe(0);
  });

  it("captures very heavy items in tier 3 via the null maxWeight open upper bound", () => {
    const items = [
      { weight: 10.01 },
      { weight: 50 },
      { weight: 999 },
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS);
    expect(out.base[2].orderCount).toBe(3);
    expect(out.base[2].totalWeight).toBeCloseTo(1059.01, 2);
    expect(out.base[2].subtotal).toBeCloseTo(6.6, 2);
  });

  it("returns zero-filled rows for every tier when the item list is empty", () => {
    const out = buildTierBreakdown([], DEFAULT_TIERS);
    expect(out.base).toHaveLength(3);
    expect(out.bonusTierEarnings).toEqual([]);
    for (const row of out.base) {
      expect(row.orderCount).toBe(0);
      expect(row.totalWeight).toBe(0);
      expect(row.subtotal).toBe(0);
    }
  });

  it("returns rows for whichever tiers exist when the snapshot is malformed (missing tier 3)", () => {
    const truncated: WeightTierSnapshot[] = [
      { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
      { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
    ];
    const items = [{ weight: 3 }, { weight: 7 }, { weight: 20 }];
    const out = buildTierBreakdown(items, truncated);
    expect(out.base).toHaveLength(2);
    expect(out.base[0].orderCount).toBe(1);
    expect(out.base[1].orderCount).toBe(1);
  });

  it("returns empty bonusTierEarnings array when no items are flagged isBonusTier", () => {
    const items = [
      { weight: 3, isBonusTier: false },
      { weight: 7, isBonusTier: false },
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS, DEFAULT_BONUS_TIERS);
    expect(out.bonusTierEarnings).toEqual([]);
    expect(out.base[0].orderCount).toBe(1);
    expect(out.base[1].orderCount).toBe(1);
  });

  it("splits items between base and bonusTierEarnings by isBonusTier flag", () => {
    const items = [
      { weight: 3, isBonusTier: false }, // base T1
      { weight: 3, isBonusTier: false }, // base T1
      { weight: 7, isBonusTier: false }, // base T2
      { weight: 3, isBonusTier: true },  // bonusTierEarnings T1
      { weight: 7, isBonusTier: true },  // bonusTierEarnings T2
      { weight: 15, isBonusTier: true }, // bonusTierEarnings T3
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS, DEFAULT_BONUS_TIERS);

    expect(out.base).toHaveLength(3);
    expect(out.base[0]).toMatchObject({ orderCount: 2, subtotal: 2.0 }); // 2 × 1.00
    expect(out.base[1]).toMatchObject({ orderCount: 1, subtotal: 1.4 }); // 1 × 1.40
    expect(out.base[2]).toMatchObject({ orderCount: 0, subtotal: 0 });

    expect(out.bonusTierEarnings).toHaveLength(3);
    expect(out.bonusTierEarnings[0]).toMatchObject({
      tier: 1,
      range: "0–5 kg",
      commission: 1.5,
      orderCount: 1,
      subtotal: 1.5,
    });
    expect(out.bonusTierEarnings[1]).toMatchObject({
      tier: 2,
      commission: 2.1,
      orderCount: 1,
      subtotal: 2.1,
    });
    expect(out.bonusTierEarnings[2]).toMatchObject({
      tier: 3,
      commission: 3.3,
      orderCount: 1,
      subtotal: 3.3,
    });
  });

  it("preserves T1 → T2 → T3 ordering in both arrays", () => {
    const unsorted: BonusTierSnapshotRow[] = [
      { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
      { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
      { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
    ];
    const items = [{ weight: 3, isBonusTier: true }];
    const out = buildTierBreakdown(items, DEFAULT_TIERS, unsorted);
    expect(out.bonusTierEarnings.map((r) => r.tier)).toEqual([1, 2, 3]);
  });
});
