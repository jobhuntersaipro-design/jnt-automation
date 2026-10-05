import { describe, it, expect } from "vitest";
import { buildDemoDataset, lastCompleteMonths, MAX_DEMO_BRANCHES } from "../dataset";
import { calculateSalary } from "@/lib/upload/calculator";

const NOW = new Date(2026, 9, 5); // 5 Oct 2026

const RULES = {
  weightTiers: [
    { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
    { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
    { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
  ],
  bonusTiers: [
    { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
    { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
    { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
  ],
  incentiveRule: { orderThreshold: 2000 },
};

describe("demo dataset", () => {
  it("covers the 6 complete months before now, across a year boundary", () => {
    expect(lastCompleteMonths(NOW, 6)).toEqual([
      { year: 2026, month: 4 }, { year: 2026, month: 5 }, { year: 2026, month: 6 },
      { year: 2026, month: 7 }, { year: 2026, month: 8 }, { year: 2026, month: 9 },
    ]);
    expect(lastCompleteMonths(new Date(2026, 1, 10), 3)).toEqual([
      { year: 2025, month: 11 }, { year: 2025, month: 12 }, { year: 2026, month: 1 },
    ]);
  });

  it("is deterministic", () => {
    const a = buildDemoDataset(NOW);
    const b = buildDemoDataset(NOW);
    expect(a.dispatchers[0].months[2].rows.length).toBe(b.dispatchers[0].months[2].rows.length);
    expect(a.dispatchers[3].months[5].rows[10]).toEqual(b.dispatchers[3].months[5].rows[10]);
  });

  it("produces rows the real calculator prices fully, with unique waybills in-month", () => {
    const data = buildDemoDataset(NOW);
    let bonusHit = false;
    let petrolDays = 0;
    for (const d of data.dispatchers) {
      for (const m of d.months) {
        expect(m.rows.every((r) => r.branchName === data.code && r.deliveryDate!.getMonth() + 1 === m.month)).toBe(true);
        expect(new Set(m.rows.map((r) => r.waybillNumber)).size).toBe(m.rows.length);
        const result = calculateSalary(
          { dispatcherId: d.extId, extId: d.extId, ...RULES, petrolRule: { isEligible: d.petrolEligible, dailyThreshold: 70, subsidyAmount: 15 } },
          m.rows,
        );
        // Every parcel lands in a tier (no 0-commission gaps between tiers).
        expect(result.lineItems.every((li) => li.commission > 0)).toBe(true);
        if (result.bonusTierEarnings > 0) bonusHit = true;
        petrolDays += result.petrolQualifyingDays;
      }
    }
    // The sample should demonstrate both bonus tiers and petrol subsidy.
    expect(bonusHit).toBe(true);
    expect(petrolDays).toBeGreaterThan(0);
  });

  it("builds distinct extra branches (DEMO02+) with their own people and waybills", () => {
    const sets = Array.from({ length: MAX_DEMO_BRANCHES }, (_, b) => buildDemoDataset(NOW, b));
    expect(sets.map((d) => d.code)).toEqual(["DEMO01", "DEMO02", "DEMO03", "DEMO04"]);
    const names = sets.flatMap((d) => [...d.dispatchers, ...d.employees].map((p) => p.name));
    expect(new Set(names).size).toBe(names.length);
    const waybills = sets.flatMap((d) => d.dispatchers.flatMap((x) => x.months.flatMap((m) => m.rows.map((r) => r.waybillNumber))));
    expect(new Set(waybills).size).toBe(waybills.length);
    // Well-formed 12-digit MyKad numbers (gender is derived from the last digit).
    for (const d of sets.slice(1)) expect(d.dispatchers.every((x) => /^\d{12}$/.test(x.icNo))).toBe(true);
    expect(() => buildDemoDataset(NOW, MAX_DEMO_BRANCHES)).toThrow();
  });
});
