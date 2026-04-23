import { describe, it, expect } from "vitest";
import { bucketLineItemChanges, rulesMatchSnapshot } from "../re-price-helpers";

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

const PETROL = { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 };

describe("rulesMatchSnapshot", () => {
  it("returns true when current rules match the saved snapshot exactly", () => {
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: PETROL },
        {
          weightTiersSnapshot: WEIGHT_TIERS,
          bonusTierSnapshot: { orderThreshold: 2000, tiers: BONUS_TIERS },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(true);
  });

  it("returns false when any weight tier commission differs", () => {
    const changed = [...WEIGHT_TIERS];
    changed[0] = { ...changed[0], commission: 1.25 };
    expect(
      rulesMatchSnapshot(
        { weightTiers: changed, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: PETROL },
        {
          weightTiersSnapshot: WEIGHT_TIERS,
          bonusTierSnapshot: { orderThreshold: 2000, tiers: BONUS_TIERS },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(false);
  });

  it("returns false when orderThreshold differs", () => {
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2500, petrol: PETROL },
        {
          weightTiersSnapshot: WEIGHT_TIERS,
          bonusTierSnapshot: { orderThreshold: 2000, tiers: BONUS_TIERS },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(false);
  });

  it("returns false when petrol settings differ", () => {
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: { ...PETROL, subsidyAmount: 20 } },
        {
          weightTiersSnapshot: WEIGHT_TIERS,
          bonusTierSnapshot: { orderThreshold: 2000, tiers: BONUS_TIERS },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(false);
  });

  it("returns false when any snapshot is null (first save, no snapshot yet)", () => {
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: PETROL },
        { weightTiersSnapshot: null, bonusTierSnapshot: null, petrolSnapshot: null },
      ),
    ).toBe(false);
  });

  it("returns false for legacy bonus snapshot without tiers array", () => {
    // Legacy { orderThreshold, incentiveAmount } shape predates per-parcel bonus tiers; must re-price.
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: PETROL },
        {
          weightTiersSnapshot: WEIGHT_TIERS,
          bonusTierSnapshot: { orderThreshold: 2000, incentiveAmount: 300 },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(false);
  });

  it("treats open upper bound (null maxWeight) as equal to null", () => {
    expect(
      rulesMatchSnapshot(
        { weightTiers: WEIGHT_TIERS, bonusTiers: BONUS_TIERS, orderThreshold: 2000, petrol: PETROL },
        {
          weightTiersSnapshot: [
            { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
            { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
            { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
          ],
          bonusTierSnapshot: { orderThreshold: 2000, tiers: BONUS_TIERS },
          petrolSnapshot: PETROL,
        },
      ),
    ).toBe(true);
  });
});

describe("bucketLineItemChanges", () => {
  it("returns empty array when every item matches", () => {
    const original = [
      { id: "a", commission: 1.0, isBonusTier: false },
      { id: "b", commission: 1.4, isBonusTier: false },
    ];
    const repriced = [
      { commission: 1.0, isBonusTier: false },
      { commission: 1.4, isBonusTier: false },
    ];
    expect(bucketLineItemChanges(original, repriced)).toEqual([]);
  });

  it("groups items that changed by (commission, isBonusTier)", () => {
    const original = [
      { id: "a", commission: 1.0, isBonusTier: false },
      { id: "b", commission: 1.0, isBonusTier: false },
      { id: "c", commission: 1.4, isBonusTier: false },
      { id: "d", commission: 1.4, isBonusTier: false },
    ];
    const repriced = [
      { commission: 1.5, isBonusTier: true },
      { commission: 1.5, isBonusTier: true },
      { commission: 2.1, isBonusTier: true },
      { commission: 2.1, isBonusTier: true },
    ];
    const buckets = bucketLineItemChanges(original, repriced);
    expect(buckets).toHaveLength(2);
    expect(buckets.find((b) => b.commission === 1.5)?.ids.sort()).toEqual(["a", "b"]);
    expect(buckets.find((b) => b.commission === 2.1)?.ids.sort()).toEqual(["c", "d"]);
    expect(buckets.every((b) => b.isBonusTier === true)).toBe(true);
  });

  it("skips items whose commission AND isBonusTier both still match", () => {
    const original = [
      { id: "a", commission: 1.0, isBonusTier: false },
      { id: "b", commission: 1.0, isBonusTier: false },
      { id: "c", commission: 1.0, isBonusTier: false },
    ];
    const repriced = [
      { commission: 1.0, isBonusTier: false }, // unchanged → skipped
      { commission: 1.5, isBonusTier: true }, // changed
      { commission: 1.0, isBonusTier: false }, // unchanged → skipped
    ];
    const buckets = bucketLineItemChanges(original, repriced);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].ids).toEqual(["b"]);
    expect(buckets[0].commission).toBe(1.5);
    expect(buckets[0].isBonusTier).toBe(true);
  });

  it("still buckets when only the isBonusTier flag changes (same commission)", () => {
    const original = [{ id: "a", commission: 1.0, isBonusTier: false }];
    const repriced = [{ commission: 1.0, isBonusTier: true }];
    const buckets = bucketLineItemChanges(original, repriced);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({ commission: 1.0, isBonusTier: true, ids: ["a"] });
  });
});
