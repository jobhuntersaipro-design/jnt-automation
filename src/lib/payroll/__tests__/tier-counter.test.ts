import { describe, it, expect } from "vitest";
import { countParcelsPerTier, countBonusParcelsPerTier } from "../tier-counter";

const defaultTiers = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

const bonusTiers = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

describe("countParcelsPerTier (default tier — excludes bonus items)", () => {
  it("treats items with no isBonusTier field as default-tier (back-compat for historical rows)", () => {
    const items = [
      { weight: 3, commission: 1.0 },
      { weight: 3, commission: 1.0 },
      { weight: 7, commission: 1.4 },
    ];
    const result = countParcelsPerTier(items, defaultTiers);
    expect(result).toEqual([
      { tier: 1, count: 2, rate: 1.0, total: 2.0 },
      { tier: 2, count: 1, rate: 1.4, total: 1.4 },
    ]);
  });

  it("excludes items where isBonusTier === true", () => {
    const items = [
      { weight: 3, commission: 1.0, isBonusTier: false },
      { weight: 3, commission: 1.0, isBonusTier: false },
      { weight: 3, commission: 1.5, isBonusTier: true }, // bonus — must NOT appear in default breakdown
      { weight: 7, commission: 1.4, isBonusTier: false },
    ];
    const result = countParcelsPerTier(items, defaultTiers);
    expect(result).toEqual([
      { tier: 1, count: 2, rate: 1.0, total: 2.0 },
      { tier: 2, count: 1, rate: 1.4, total: 1.4 },
    ]);
  });

  it("returns empty array when every item is flagged as bonus tier", () => {
    const items = [
      { weight: 3, commission: 1.5, isBonusTier: true },
      { weight: 7, commission: 2.1, isBonusTier: true },
    ];
    expect(countParcelsPerTier(items, defaultTiers)).toEqual([]);
  });
});

describe("countBonusParcelsPerTier (bonus tier — only counts bonus items)", () => {
  it("counts only items where isBonusTier === true, against the bonus tier snapshot", () => {
    const items = [
      { weight: 3, commission: 1.0, isBonusTier: false }, // skipped
      { weight: 3, commission: 1.5, isBonusTier: true },
      { weight: 3, commission: 1.5, isBonusTier: true },
      { weight: 7, commission: 2.1, isBonusTier: true },
      { weight: 15, commission: 3.3, isBonusTier: true },
    ];
    const result = countBonusParcelsPerTier(items, bonusTiers);
    expect(result).toEqual([
      { tier: 1, count: 2, rate: 1.5, total: 3.0 },
      { tier: 2, count: 1, rate: 2.1, total: 2.1 },
      { tier: 3, count: 1, rate: 3.3, total: 3.3 },
    ]);
  });

  it("returns empty array when no items are flagged as bonus tier", () => {
    const items = [
      { weight: 3, commission: 1.0, isBonusTier: false },
      { weight: 7, commission: 1.4, isBonusTier: false },
    ];
    expect(countBonusParcelsPerTier(items, bonusTiers)).toEqual([]);
  });

  it("returns empty array when input is empty", () => {
    expect(countBonusParcelsPerTier([], bonusTiers)).toEqual([]);
  });

  it("filters out tiers with zero count (same contract as default counter)", () => {
    const items = [
      { weight: 3, commission: 1.5, isBonusTier: true },
    ];
    const result = countBonusParcelsPerTier(items, bonusTiers);
    expect(result).toEqual([{ tier: 1, count: 1, rate: 1.5, total: 1.5 }]);
  });
});
