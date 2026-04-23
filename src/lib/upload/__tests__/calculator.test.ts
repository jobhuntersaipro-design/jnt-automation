import { describe, it, expect } from "vitest";
import {
  calculateSalary,
  getCommission,
  type DispatcherRules,
  type BonusTierInput,
  type WeightTierInput,
} from "../calculator";
import type { ParsedRow } from "../parser";

// ─── Helpers ──────────────────────────────────────────────────

const defaultTiers: WeightTierInput[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

const defaultBonusTiers: BonusTierInput[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

function makeDispatcher(
  overrides: Partial<DispatcherRules> = {},
): DispatcherRules {
  return {
    dispatcherId: "disp-1",
    extId: "D001",
    weightTiers: defaultTiers,
    incentiveRule: { orderThreshold: 2000 },
    bonusTiers: defaultBonusTiers,
    petrolRule: { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 },
    ...overrides,
  };
}

function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    waybillNumber: "WB001",
    branchName: "KPG",
    deliveryDate: new Date("2026-03-15"),
    dispatcherId: "D001",
    dispatcherName: "Test",
    billingWeight: 3.0,
    ...overrides,
  };
}

function makeRows(count: number, overrides: Partial<ParsedRow> = {}): ParsedRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeRow({ waybillNumber: `WB${String(i + 1).padStart(4, "0")}`, ...overrides }),
  );
}

// ─── Weight Tier Commission Tests ─────────────────────────────

describe("getCommission", () => {
  it("assigns tier 1 for weight exactly at boundary (5.00kg)", () => {
    expect(getCommission(5.0, defaultTiers)).toBe(1.0);
  });

  it("assigns tier 2 for weight just above boundary (5.01kg)", () => {
    expect(getCommission(5.01, defaultTiers)).toBe(1.4);
  });

  it("assigns tier 3 for weight above 10kg", () => {
    expect(getCommission(15, defaultTiers)).toBe(2.2);
  });

  it("assigns tier 1 for very light parcel (0.1kg)", () => {
    expect(getCommission(0.1, defaultTiers)).toBe(1.0);
  });

  it("assigns tier 3 for weight at boundary (10.01kg)", () => {
    expect(getCommission(10.01, defaultTiers)).toBe(2.2);
  });

  it("assigns tier 2 for weight at upper boundary (10.00kg)", () => {
    expect(getCommission(10.0, defaultTiers)).toBe(1.4);
  });

  it("returns 0 commission if no tier matches", () => {
    const gappedTiers: WeightTierInput[] = [
      { tier: 1, minWeight: 5, maxWeight: 10, commission: 1.0 },
    ];
    expect(getCommission(3.0, gappedTiers)).toBe(0);
  });

  it("returns 0 commission for empty tiers", () => {
    expect(getCommission(5.0, [])).toBe(0);
  });
});

// ─── Bonus Tier Tests (new model) ─────────────────────────

describe("bonusTierEarnings tiers", () => {
  it("no bonusTierEarnings when totalOrders < threshold — all parcels at WeightTier rate", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2000 },
    });
    const rows = makeRows(1999, { billingWeight: 3.0 }); // tier 1: WeightTier 1.00
    const result = calculateSalary(dispatcher, rows);
    expect(result.baseSalary).toBe(1999 * 1.0);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.lineItems.every((li) => li.isBonusTier === false)).toBe(true);
  });

  it("no bonusTierEarnings when totalOrders equals threshold exactly (> not >=)", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 5 },
    });
    const rows = makeRows(5, { billingWeight: 3.0 });
    const result = calculateSalary(dispatcher, rows);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.baseSalary).toBe(5.0);
    expect(result.lineItems.every((li) => li.isBonusTier === false)).toBe(true);
  });

  it("orderThreshold=0 → bonus tier disabled, all parcels priced at WeightTier rate", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 0 },
    });
    const rows = makeRows(5, { billingWeight: 3.0 });
    const result = calculateSalary(dispatcher, rows);
    expect(result.baseSalary).toBe(5 * 1.0);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.lineItems.every((li) => li.isBonusTier === false)).toBe(true);
  });

  it("threshold crossed by 1 → only parcel #N+1 priced at BonusTier", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 3 },
    });
    const rows = makeRows(4, { billingWeight: 3.0 }); // all tier 1
    const result = calculateSalary(dispatcher, rows);
    // first 3 at WeightTier 1.00 = 3.00, the 4th at BonusTier 1.50
    expect(result.baseSalary).toBe(3.0);
    expect(result.bonusTierEarnings).toBe(1.5);
    expect(result.lineItems[0].isBonusTier).toBe(false);
    expect(result.lineItems[1].isBonusTier).toBe(false);
    expect(result.lineItems[2].isBonusTier).toBe(false);
    expect(result.lineItems[3].isBonusTier).toBe(true);
  });

  it("mixed weights across threshold — bonusTierEarnings tier picked by parcel weight", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2 },
    });
    // 4 parcels ascending dates for deterministic ordering
    const rows = [
      makeRow({ waybillNumber: "A", billingWeight: 3.0, deliveryDate: new Date("2026-03-01") }),
      makeRow({ waybillNumber: "B", billingWeight: 7.5, deliveryDate: new Date("2026-03-02") }),
      makeRow({ waybillNumber: "C", billingWeight: 3.0, deliveryDate: new Date("2026-03-03") }),
      makeRow({ waybillNumber: "D", billingWeight: 15.0, deliveryDate: new Date("2026-03-04") }),
    ];
    const result = calculateSalary(dispatcher, rows);
    // base: A (1.00) + B (1.40) = 2.40
    // bonus: C at BonusTier1 (1.50) + D at BonusTier3 (3.30) = 4.80
    expect(result.baseSalary).toBe(2.4);
    expect(result.bonusTierEarnings).toBe(4.8);
    expect(result.lineItems[2].isBonusTier).toBe(true);
    expect(result.lineItems[3].isBonusTier).toBe(true);
  });

  it("stable sort — parcels with null deliveryDate sort last", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2 },
    });
    const rows = [
      makeRow({ waybillNumber: "NULL", billingWeight: 3.0, deliveryDate: null }),
      makeRow({ waybillNumber: "FIRST", billingWeight: 3.0, deliveryDate: new Date("2026-03-01") }),
      makeRow({ waybillNumber: "SECOND", billingWeight: 3.0, deliveryDate: new Date("2026-03-02") }),
    ];
    const result = calculateSalary(dispatcher, rows);
    // After sort: FIRST (base), SECOND (base), NULL (bonusTierEarnings — sorted last)
    const nullItem = result.lineItems.find((li) => li.waybillNumber === "NULL");
    expect(nullItem?.isBonusTier).toBe(true);
    expect(result.lineItems[0].waybillNumber).toBe("FIRST");
    expect(result.lineItems[1].waybillNumber).toBe("SECOND");
    expect(result.lineItems[2].waybillNumber).toBe("NULL");
  });

  it("stable tiebreaker by waybillNumber when same deliveryDate", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 1 },
    });
    const sameDate = new Date("2026-03-15");
    const rows = [
      makeRow({ waybillNumber: "ZZZ", billingWeight: 3.0, deliveryDate: sameDate }),
      makeRow({ waybillNumber: "AAA", billingWeight: 3.0, deliveryDate: sameDate }),
      makeRow({ waybillNumber: "MMM", billingWeight: 3.0, deliveryDate: sameDate }),
    ];
    const result = calculateSalary(dispatcher, rows);
    expect(result.lineItems.map((li) => li.waybillNumber)).toEqual(["AAA", "MMM", "ZZZ"]);
    expect(result.lineItems[0].isBonusTier).toBe(false); // AAA — below threshold
    expect(result.lineItems[1].isBonusTier).toBe(true); // MMM — above
    expect(result.lineItems[2].isBonusTier).toBe(true); // ZZZ — above
  });

  it("bonusTierEarnings tiers missing a weight bucket → commission 0 for that parcel (no fallback)", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 1 },
      bonusTiers: [
        // only tier 1 defined — tier 2 and 3 missing
        { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
      ],
    });
    const rows = [
      makeRow({ waybillNumber: "A", billingWeight: 3.0, deliveryDate: new Date("2026-03-01") }),
      makeRow({ waybillNumber: "B", billingWeight: 7.5, deliveryDate: new Date("2026-03-02") }), // tier 2 weight, no bonusTierEarnings tier
    ];
    const result = calculateSalary(dispatcher, rows);
    // A at WeightTier 1: 1.00 → base
    // B above threshold, no bonusTierEarnings tier matches 7.5kg → commission 0
    expect(result.baseSalary).toBe(1.0);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.lineItems[1].isBonusTier).toBe(true); // flagged, even though commission is 0
    expect(result.lineItems[1].commission).toBe(0);
  });

  it("persists new-shape bonusTierSnapshot with tiers", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, [makeRow()]);
    expect(result.bonusTierSnapshot.orderThreshold).toBe(2000);
    expect(result.bonusTierSnapshot.tiers).toEqual(defaultBonusTiers);
  });

  it("netSalary = baseSalary + bonusTierEarnings + petrolSubsidy + commission − penalty − advance", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2 },
      petrolRule: { isEligible: true, dailyThreshold: 2, subsidyAmount: 15 },
    });
    const rows = makeRows(3, {
      billingWeight: 3.0,
      deliveryDate: new Date("2026-03-15"),
    });
    const result = calculateSalary(dispatcher, rows);
    // base: 2 * 1.00 = 2.00; bonusTierEarnings: 1 * 1.50 = 1.50; petrol: 15
    // commission defaults to 0 — it's a manual additive set via recalculate.
    expect(result.baseSalary).toBe(2.0);
    expect(result.bonusTierEarnings).toBe(1.5);
    expect(result.petrolSubsidy).toBe(15);
    expect(result.commission).toBe(0);
    expect(result.penalty).toBe(0);
    expect(result.advance).toBe(0);
    expect(result.netSalary).toBe(18.5);
  });

  it("calculateSalary initialises commission to 0 (it's a manual additive)", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, makeRows(3));
    expect(result.commission).toBe(0);
  });

  it("lineItem.isBonusTier matches the tier used to price each parcel", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2 },
    });
    const rows = makeRows(4, { billingWeight: 3.0 });
    const result = calculateSalary(dispatcher, rows);
    // Parcels 1-2 base (0.00), parcels 3-4 bonusTierEarnings
    expect(result.lineItems[0]).toMatchObject({ commission: 1.0, isBonusTier: false });
    expect(result.lineItems[1]).toMatchObject({ commission: 1.0, isBonusTier: false });
    expect(result.lineItems[2]).toMatchObject({ commission: 1.5, isBonusTier: true });
    expect(result.lineItems[3]).toMatchObject({ commission: 1.5, isBonusTier: true });
  });
});

// ─── Petrol Subsidy Tests ─────────────────────────────────────

describe("petrol subsidy", () => {
  it("applies subsidy for a qualifying day", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: true, dailyThreshold: 3, subsidyAmount: 15 },
    });
    const rows = makeRows(5, { deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(15);
  });

  it("applies subsidy for multiple qualifying days", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: true, dailyThreshold: 2, subsidyAmount: 15 },
    });
    const rows = [
      ...makeRows(3, { deliveryDate: new Date("2026-03-15") }),
      ...makeRows(3, { deliveryDate: new Date("2026-03-16") }),
    ];
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(30);
  });

  it("does not apply subsidy if not eligible", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: false, dailyThreshold: 2, subsidyAmount: 15 },
    });
    const rows = makeRows(10, { deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(0);
  });

  it("does not apply subsidy if daily orders below threshold", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 },
    });
    const rows = makeRows(5, { deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(0);
  });

  it("does not apply subsidy for rows with null delivery dates", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: true, dailyThreshold: 3, subsidyAmount: 15 },
    });
    const rows = makeRows(5, { deliveryDate: null });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(0);
  });

  it("does not double-count same-day deliveries", () => {
    const dispatcher = makeDispatcher({
      petrolRule: { isEligible: true, dailyThreshold: 2, subsidyAmount: 15 },
    });
    const rows = makeRows(5, { deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(15);
  });
});

// ─── Net Salary Tests ─────────────────────────────────────────

describe("net salary", () => {
  it("handles zero bonusTierEarnings and zero petrol", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 9999 },
      petrolRule: { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 },
    });
    const rows = makeRows(2, { billingWeight: 7.0 });
    const result = calculateSalary(dispatcher, rows);

    expect(result.baseSalary).toBe(2.8);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.petrolSubsidy).toBe(0);
    expect(result.netSalary).toBe(2.8);
  });

  it("handles mixed weight tiers", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 100 },
    });
    const rows = [
      makeRow({ billingWeight: 2.0, deliveryDate: new Date("2026-03-01") }),
      makeRow({ billingWeight: 7.5, deliveryDate: new Date("2026-03-02") }),
      makeRow({ billingWeight: 15.0, deliveryDate: new Date("2026-03-03") }),
    ];
    const result = calculateSalary(dispatcher, rows);
    expect(result.baseSalary).toBe(4.6);
    expect(result.totalOrders).toBe(3);
  });

  it("handles zero deliveries", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, []);
    expect(result.totalOrders).toBe(0);
    expect(result.baseSalary).toBe(0);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.petrolSubsidy).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it("includes correct line items in result", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 100 },
    });
    const rows = [
      makeRow({ waybillNumber: "WB001", billingWeight: 3.0, deliveryDate: new Date("2026-03-01") }),
      makeRow({ waybillNumber: "WB002", billingWeight: 7.0, deliveryDate: new Date("2026-03-02") }),
    ];
    const result = calculateSalary(dispatcher, rows);

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0].waybillNumber).toBe("WB001");
    expect(result.lineItems[0].commission).toBe(1.0);
    expect(result.lineItems[0].isBonusTier).toBe(false);
    expect(result.lineItems[1].waybillNumber).toBe("WB002");
    expect(result.lineItems[1].commission).toBe(1.4);
    expect(result.lineItems[1].isBonusTier).toBe(false);
  });

  it("includes rule snapshots in result", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, [makeRow()]);

    expect(result.weightTiersSnapshot).toEqual(defaultTiers);
    expect(result.bonusTierSnapshot).toEqual({
      orderThreshold: dispatcher.incentiveRule.orderThreshold,
      tiers: defaultBonusTiers,
    });
    expect(result.petrolSnapshot).toEqual(dispatcher.petrolRule);
  });
});
