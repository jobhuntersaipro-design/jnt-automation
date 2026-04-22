import { describe, it, expect } from "vitest";
import { buildTierBreakdown, type WeightTierSnapshot } from "../month-detail";

const DEFAULT_TIERS: WeightTierSnapshot[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

describe("buildTierBreakdown", () => {
  it("counts line items and computes subtotals across all three tiers (happy path)", () => {
    const items = [
      { weight: 0.5 }, { weight: 1.0 }, { weight: 4.99 }, // tier 1 ×3
      { weight: 6 }, { weight: 10 }, // tier 2 ×2
      { weight: 15 }, // tier 3 ×1
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS);

    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({
      tier: 1,
      range: "0–5 kg",
      commission: 1.0,
      orderCount: 3,
      totalWeight: 6.49,
      subtotal: 3.0,
    });
    expect(out[1]).toMatchObject({
      tier: 2,
      range: "5.01–10 kg",
      commission: 1.4,
      orderCount: 2,
      totalWeight: 16,
      subtotal: 2.8,
    });
    expect(out[2]).toMatchObject({
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
    expect(out[0].orderCount).toBe(1);
    expect(out[1].orderCount).toBe(1);
    expect(out[2].orderCount).toBe(0);
  });

  it("captures very heavy items in tier 3 via the null maxWeight open upper bound", () => {
    const items = [
      { weight: 10.01 },
      { weight: 50 },
      { weight: 999 },
    ];
    const out = buildTierBreakdown(items, DEFAULT_TIERS);
    expect(out[2].orderCount).toBe(3);
    expect(out[2].totalWeight).toBeCloseTo(1059.01, 2);
    expect(out[2].subtotal).toBeCloseTo(6.6, 2);
  });

  it("returns zero-filled rows for every tier when the item list is empty", () => {
    const out = buildTierBreakdown([], DEFAULT_TIERS);
    expect(out).toHaveLength(3);
    for (const row of out) {
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
    // Item above the last tier's maxWeight should NOT blow up — it's simply
    // uncounted (no matching tier).
    const items = [{ weight: 3 }, { weight: 7 }, { weight: 20 }];
    const out = buildTierBreakdown(items, truncated);
    expect(out).toHaveLength(2);
    expect(out[0].orderCount).toBe(1);
    expect(out[1].orderCount).toBe(1);
  });
});
