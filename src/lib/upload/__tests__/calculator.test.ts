import { describe, it, expect } from "vitest";
import {
  calculateSalary,
  getCommission,
  type DispatcherRules,
  type WeightTierInput,
} from "../calculator";
import type { ParsedRow } from "../parser";

// ─── Helpers ──────────────────────────────────────────────────

const defaultTiers: WeightTierInput[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

function makeDispatcher(
  overrides: Partial<DispatcherRules> = {},
): DispatcherRules {
  return {
    dispatcherId: "disp-1",
    extId: "D001",
    weightTiers: defaultTiers,
    incentiveRule: { orderThreshold: 2000, incentiveAmount: 200 },
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

// ─── Incentive Tests ──────────────────────────────────────────

describe("incentive", () => {
  it("applies incentive when orders meet threshold exactly", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 5, incentiveAmount: 200 },
    });
    const rows = makeRows(5);
    const result = calculateSalary(dispatcher, rows);
    expect(result.incentive).toBe(200);
  });

  it("applies incentive when orders exceed threshold", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 3, incentiveAmount: 150 },
    });
    const rows = makeRows(10);
    const result = calculateSalary(dispatcher, rows);
    expect(result.incentive).toBe(150);
  });

  it("does not apply incentive when orders below threshold", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2000, incentiveAmount: 200 },
    });
    const rows = makeRows(5);
    const result = calculateSalary(dispatcher, rows);
    expect(result.incentive).toBe(0);
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
    // All 5 deliveries on the same day — should only get one subsidy
    const rows = makeRows(5, { deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);
    expect(result.petrolSubsidy).toBe(15);
  });
});

// ─── Net Salary Tests ─────────────────────────────────────────

describe("net salary", () => {
  it("calculates net salary with all components", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 2, incentiveAmount: 100 },
      petrolRule: { isEligible: true, dailyThreshold: 2, subsidyAmount: 15 },
    });
    // 3 deliveries at 3kg (tier 1 = RM1.00 each) on same day
    const rows = makeRows(3, { billingWeight: 3.0, deliveryDate: new Date("2026-03-15") });
    const result = calculateSalary(dispatcher, rows);

    expect(result.baseSalary).toBe(3.0); // 3 * RM1.00
    expect(result.incentive).toBe(100);
    expect(result.petrolSubsidy).toBe(15);
    expect(result.penalty).toBe(0);
    expect(result.advance).toBe(0);
    expect(result.netSalary).toBe(118); // 3 + 100 + 15
  });

  it("handles zero incentive and zero petrol", () => {
    const dispatcher = makeDispatcher({
      incentiveRule: { orderThreshold: 9999, incentiveAmount: 200 },
      petrolRule: { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 },
    });
    const rows = makeRows(2, { billingWeight: 7.0 }); // tier 2 = RM1.40
    const result = calculateSalary(dispatcher, rows);

    expect(result.baseSalary).toBe(2.8); // 2 * RM1.40
    expect(result.incentive).toBe(0);
    expect(result.petrolSubsidy).toBe(0);
    expect(result.netSalary).toBe(2.8);
  });

  it("handles mixed weight tiers", () => {
    const dispatcher = makeDispatcher();
    const rows = [
      makeRow({ billingWeight: 2.0 }),   // tier 1: RM1.00
      makeRow({ billingWeight: 7.5 }),   // tier 2: RM1.40
      makeRow({ billingWeight: 15.0 }),  // tier 3: RM2.20
    ];
    const result = calculateSalary(dispatcher, rows);
    expect(result.baseSalary).toBe(4.6); // 1.00 + 1.40 + 2.20
    expect(result.totalOrders).toBe(3);
  });

  it("handles zero deliveries", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, []);
    expect(result.totalOrders).toBe(0);
    expect(result.baseSalary).toBe(0);
    expect(result.incentive).toBe(0);
    expect(result.petrolSubsidy).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it("includes correct line items in result", () => {
    const dispatcher = makeDispatcher();
    const rows = [
      makeRow({ waybillNumber: "WB001", billingWeight: 3.0 }),
      makeRow({ waybillNumber: "WB002", billingWeight: 7.0 }),
    ];
    const result = calculateSalary(dispatcher, rows);

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0].waybillNumber).toBe("WB001");
    expect(result.lineItems[0].commission).toBe(1.0);
    expect(result.lineItems[1].waybillNumber).toBe("WB002");
    expect(result.lineItems[1].commission).toBe(1.4);
  });

  it("includes rule snapshots in result", () => {
    const dispatcher = makeDispatcher();
    const result = calculateSalary(dispatcher, [makeRow()]);

    expect(result.weightTiersSnapshot).toEqual(defaultTiers);
    expect(result.incentiveSnapshot).toEqual(dispatcher.incentiveRule);
    expect(result.petrolSnapshot).toEqual(dispatcher.petrolRule);
  });
});
