import { describe, it, expect } from "vitest";
import {
  calculateSupervisorGross,
  calculateStoreKeeperGross,
  calculateStatutory,
} from "../statutory";

describe("calculateSupervisorGross", () => {
  it("sums basicPay + petrol + kpi + ot + other allowances", () => {
    // basicPay 3000, petrol 100, kpi 200, ot 80, other 50 → 3430
    expect(calculateSupervisorGross(3000, 100, 200, 80, 50)).toBe(3430);
  });

  it("treats omitted hourly params as zero (backward compatible)", () => {
    expect(calculateSupervisorGross(3000, 0, 0, 0, 0)).toBe(3000);
  });

  it("adds workingHours × hourlyWage when both are provided", () => {
    // Supervisor on a monthly base who also logged 20 OT hours at RM15/hr.
    expect(calculateSupervisorGross(3000, 100, 0, 0, 0, 20, 15)).toBe(3400);
  });

  it("adds zero from hourly when hourlyWage is zero even with non-zero hours", () => {
    expect(calculateSupervisorGross(3000, 0, 0, 0, 0, 40, 0)).toBe(3000);
  });

  it("adds zero from hourly when workingHours is zero", () => {
    expect(calculateSupervisorGross(3000, 0, 0, 0, 0, 0, 25)).toBe(3000);
  });

  it("OT allowance contributes to gross like petrol/other", () => {
    // basicPay 3000 + ot 250 → 3250 (other allowances all zero)
    expect(calculateSupervisorGross(3000, 0, 0, 250, 0)).toBe(3250);
  });
});

describe("calculateStoreKeeperGross", () => {
  it("multiplies hours × rate and adds allowances", () => {
    // 160 × 10 + petrol 100 + kpi 50 + ot 30 + other 20 → 1800
    expect(calculateStoreKeeperGross(160, 10, 100, 50, 30, 20)).toBe(1800);
  });

  it("returns the allowances sum when hours = 0", () => {
    // 0 × 10 + 100 + 50 + 30 + 20 → 200
    expect(calculateStoreKeeperGross(0, 10, 100, 50, 30, 20)).toBe(200);
  });

  it("OT allowance contributes to gross like petrol/other", () => {
    expect(calculateStoreKeeperGross(160, 10, 0, 0, 250, 0)).toBe(1850);
  });
});

describe("calculateStatutory — EPF (KWSP Jadual Ketiga, 1 Oct 2025, Part A)", () => {
  it("returns NIL for wages ≤ RM10", () => {
    const r = calculateStatutory(10);
    expect(r.epfEmployee).toBe(0);
    expect(r.epfEmployer).toBe(0);
    expect(r.epfBonusRuleApplied).toBe(false);
  });

  it("matches schedule at the bottom: RM 30 → bracket 40, employer 6, employee 5", () => {
    // Schedule: From 20.01 to 40.00 → Employer 6 / Employee 5 / Total 11.
    const r = calculateStatutory(30);
    expect(r.epfEmployer).toBe(6);
    expect(r.epfEmployee).toBe(5);
  });

  it("matches schedule at RM 1,000: employer 130, employee 110", () => {
    const r = calculateStatutory(1000);
    expect(r.epfEmployer).toBe(130);
    expect(r.epfEmployee).toBe(110);
  });

  it("matches schedule at the RM 5,000 boundary (still 13%)", () => {
    // From 4,980.01 to 5,000.00 → Employer 650 / Employee 550.
    const r = calculateStatutory(4995);
    expect(r.epfEmployer).toBe(650);
    expect(r.epfEmployee).toBe(550);
  });

  it("switches to 12% employer above RM 5,000 with RM 100 brackets", () => {
    // From 5,000.01 to 5,100.00 → Employer 612 / Employee 561 (12% / 11%).
    const r = calculateStatutory(5050);
    expect(r.epfEmployer).toBe(612);
    expect(r.epfEmployee).toBe(561);
  });

  it("matches schedule at RM 10,500: employer 1,260, employee 1,155", () => {
    // From 10,400.01 to 10,500.00 → Employer 1,260 / Employee 1,155 / Total 2,415.
    const r = calculateStatutory(10500);
    expect(r.epfEmployer).toBe(1260);
    expect(r.epfEmployee).toBe(1155);
  });

  it("applies rates directly (no bracket) above RM 20,000", () => {
    // 22,000 × 12% = 2,640 employer; × 11% = 2,420 employee.
    const r = calculateStatutory(22000);
    expect(r.epfEmployer).toBe(2640);
    expect(r.epfEmployee).toBe(2420);
  });

  it("p.12 bonus rule fires: base wage ≤ 5k + KPI pushes over → employer stays at 13%", () => {
    // basicPay 4,500 + kpi 600 = gross 5,100. Without rule: 12% × 5,100 = 612.
    // With rule (13% on bracket 5,100): ceil(5,100 × 0.13) = 663.
    const r = calculateStatutory(5100, 600);
    expect(r.epfBonusRuleApplied).toBe(true);
    expect(r.epfEmployer).toBe(663);
    expect(r.epfEmployee).toBe(561);
  });

  it("p.12 bonus rule does NOT fire when base wage is already > 5k", () => {
    // basicPay 5,200 + kpi 100 = gross 5,300. Base wage (5,300 - 100) = 5,200 > 5k.
    const r = calculateStatutory(5300, 100);
    expect(r.epfBonusRuleApplied).toBe(false);
    expect(r.epfEmployer).toBe(636); // 12% × ceil-100 bracket 5,300
  });

  it("p.12 bonus rule does NOT fire when gross is ≤ 5k (already at 13%)", () => {
    const r = calculateStatutory(4800, 200);
    expect(r.epfBonusRuleApplied).toBe(false);
    expect(r.epfEmployer).toBe(624); // 13% × 4,800 bracket
  });

  it("ignores kpiAllowance when not provided (back-compat default 0)", () => {
    // gross 6,000, no KPI hint → 12% applies normally.
    const r = calculateStatutory(6000);
    expect(r.epfBonusRuleApplied).toBe(false);
    expect(r.epfEmployer).toBe(720);
    expect(r.epfEmployee).toBe(660);
  });

  it("returns zero for non-positive gross", () => {
    expect(calculateStatutory(0).epfEmployer).toBe(0);
    expect(calculateStatutory(-50).epfEmployee).toBe(0);
  });
});
