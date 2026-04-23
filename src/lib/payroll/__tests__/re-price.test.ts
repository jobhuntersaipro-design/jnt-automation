import { describe, it, expect } from "vitest";
import { repriceSalary, type RepriceLineItem } from "../re-price";

const WEIGHT_TIERS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

const BONUS_TIERS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

const NO_PETROL = { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 };

function lineItem(n: number, weight: number, day: number, wasBonus = false): RepriceLineItem {
  return {
    waybillNumber: `WB${n.toString().padStart(4, "0")}`,
    weight,
    deliveryDate: new Date(Date.UTC(2026, 0, day)),
    isBonusTier: wasBonus,
  };
}

describe("repriceSalary", () => {
  it("prices every parcel at base rates when threshold is 0 (bonus disabled)", () => {
    const items = [lineItem(1, 3, 1), lineItem(2, 7, 1)];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 0, NO_PETROL);
    expect(r.baseSalary).toBe(2.4); // 1.00 + 1.40
    expect(r.bonusTierEarnings).toBe(0);
    expect(r.items[0].isBonusTier).toBe(false);
    expect(r.items[1].isBonusTier).toBe(false);
  });

  it("parcel at rank N (0-indexed) is bonus when rank >= threshold", () => {
    // threshold 2 means parcels at rank 0,1 = base; rank 2 onwards = bonus.
    const items = [lineItem(1, 3, 1), lineItem(2, 3, 1), lineItem(3, 3, 1)];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 2, NO_PETROL);
    expect(r.baseSalary).toBe(2); // 2 * 1.00
    expect(r.bonusTierEarnings).toBe(1.5); // 1 * 1.50
  });

  it("picks the tier by weight band (base vs bonus)", () => {
    // 1 parcel base (3kg → T1 base = 1.00), 1 parcel bonus (7kg → T2 bonus = 2.10)
    const items = [lineItem(1, 3, 1), lineItem(2, 7, 1)];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 1, NO_PETROL);
    expect(r.baseSalary).toBe(1.0);
    expect(r.bonusTierEarnings).toBe(2.1);
  });

  it("rate change flows through: bumping bonus T1 from 1.50 → 2.00 raises bonusTierEarnings", () => {
    const items = [lineItem(1, 3, 1), lineItem(2, 3, 1), lineItem(3, 3, 1)];
    const bumped = BONUS_TIERS.map((t) => (t.tier === 1 ? { ...t, commission: 2.0 } : t));
    const r = repriceSalary(items, WEIGHT_TIERS, bumped, 2, NO_PETROL);
    expect(r.bonusTierEarnings).toBe(2.0); // 1 parcel * new bonus T1 2.00
  });

  it("threshold lowered from 2 to 1 moves one more parcel into bonus", () => {
    const items = [lineItem(1, 3, 1), lineItem(2, 3, 1), lineItem(3, 3, 1)];
    const before = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 2, NO_PETROL);
    const after = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 1, NO_PETROL);
    expect(before.baseSalary).toBe(2.0); // 2 base
    expect(before.bonusTierEarnings).toBe(1.5); // 1 bonus
    expect(after.baseSalary).toBe(1.0); // 1 base
    expect(after.bonusTierEarnings).toBe(3.0); // 2 bonus @ 1.50
  });

  it("ignores the input isBonusTier flag — re-derives from sort rank", () => {
    const items = [
      { ...lineItem(1, 3, 1), isBonusTier: true },
      { ...lineItem(2, 3, 1), isBonusTier: false },
    ];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 1, NO_PETROL);
    expect(r.items[0].isBonusTier).toBe(false); // rank 0 (earliest) = base
    expect(r.items[1].isBonusTier).toBe(true); // rank 1 = bonus
  });

  it("returns items keyed by input index, not sort rank", () => {
    const items = [lineItem(2, 3, 2), lineItem(1, 3, 1)]; // input out of sort order
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 1, NO_PETROL);
    // rank 0 (day 1, WB0001) is input index 1; rank 1 (day 2, WB0002) is input index 0
    expect(r.items[1].isBonusTier).toBe(false); // input idx 1 = earlier parcel
    expect(r.items[0].isBonusTier).toBe(true); // input idx 0 = later parcel
  });

  it("awards petrol subsidy per qualifying day, not per parcel", () => {
    // 5 parcels on day 1, threshold 3 → day 1 qualifies → 1 day * RM15 = 15
    const items = [
      lineItem(1, 3, 1), lineItem(2, 3, 1), lineItem(3, 3, 1),
      lineItem(4, 3, 1), lineItem(5, 3, 1),
    ];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 0, {
      isEligible: true, dailyThreshold: 3, subsidyAmount: 15,
    });
    expect(r.petrolQualifyingDays).toBe(1);
    expect(r.petrolSubsidy).toBe(15);
  });

  it("does not count parcels with null delivery date toward petrol days", () => {
    const items: RepriceLineItem[] = [
      { waybillNumber: "A", weight: 3, deliveryDate: null, isBonusTier: false },
      { waybillNumber: "B", weight: 3, deliveryDate: null, isBonusTier: false },
      { waybillNumber: "C", weight: 3, deliveryDate: null, isBonusTier: false },
    ];
    const r = repriceSalary(items, WEIGHT_TIERS, BONUS_TIERS, 0, {
      isEligible: true, dailyThreshold: 3, subsidyAmount: 15,
    });
    expect(r.petrolQualifyingDays).toBe(0);
    expect(r.petrolSubsidy).toBe(0);
  });

  it("rounds totals to 2dp", () => {
    // 3 parcels each rounding to 0.333... cumulatively
    const items = [lineItem(1, 3, 1), lineItem(2, 3, 1), lineItem(3, 3, 1)];
    const custom = WEIGHT_TIERS.map((t) => (t.tier === 1 ? { ...t, commission: 0.333 } : t));
    const r = repriceSalary(items, custom, BONUS_TIERS, 0, NO_PETROL);
    expect(r.baseSalary).toBe(1.0); // 3 * 0.333 = 0.999 → round → 1.00
  });
});
