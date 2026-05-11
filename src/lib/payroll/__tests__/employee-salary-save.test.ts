import { describe, it, expect } from "vitest";
import {
  computeEmployeeSalaryForSave,
  type EmployeeSavePayload,
  type EmployeeForSave,
  type DispatcherRecordForSave,
} from "../employee-salary-save";

function emp(overrides: Partial<EmployeeForSave> = {}): EmployeeForSave {
  return {
    id: "emp1",
    type: "SUPERVISOR",
    name: "Ahmad",
    branchId: "branch1",
    ...overrides,
  };
}

function entry(overrides: Partial<EmployeeSavePayload> = {}): EmployeeSavePayload {
  return {
    employeeId: "emp1",
    basicPay: 0,
    workingHours: 0,
    hourlyWage: 0,
    kpiAllowance: 0,
    petrolAllowance: 0,
    otAllowance: 0,
    otherAllowance: 0,
    pcb: 0,
    penalty: 0,
    advance: 0,
    ...overrides,
  };
}

describe("computeEmployeeSalaryForSave — Sup/Admin", () => {
  it("forces workingHours and hourlyWage to 0 for SUPERVISOR even when client sends them", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 3000, workingHours: 8, hourlyWage: 50, petrolAllowance: 100 }),
      null,
    );
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    // gross excludes 8 × 50 = 400 OT
    expect(result.grossSalary).toBe(3100);
  });

  it("forces workingHours and hourlyWage to 0 for ADMIN", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN" }),
      entry({ basicPay: 4000, workingHours: 20, hourlyWage: 30 }),
      null,
    );
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    expect(result.grossSalary).toBe(4000);
  });

  it("preserves basicPay as the only wage source for Sup/Admin", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({
        basicPay: 2500,
        petrolAllowance: 150,
        kpiAllowance: 200,
        otherAllowance: 50,
      }),
      null,
    );
    expect(result.basicPay).toBe(2500);
    expect(result.grossSalary).toBe(2500 + 150 + 200 + 50);
  });
});

describe("computeEmployeeSalaryForSave — Driver", () => {
  it("forces workingHours and hourlyWage to 0 for DRIVER even when client sends them", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "DRIVER" }),
      entry({ basicPay: 2800, workingHours: 12, hourlyWage: 25 }),
      null,
    );
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    // gross excludes 12 × 25 = 300 OT
    expect(result.grossSalary).toBe(2800);
  });

  it("preserves basicPay as the only wage source for DRIVER", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "DRIVER" }),
      entry({ basicPay: 3200 }),
      null,
    );
    expect(result.basicPay).toBe(3200);
    expect(result.grossSalary).toBe(3200);
  });

  it("combines basicPay + allowances for DRIVER gross", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "DRIVER" }),
      entry({
        basicPay: 2500,
        petrolAllowance: 200,
        kpiAllowance: 100,
        otherAllowance: 50,
      }),
      null,
    );
    expect(result.basicPay).toBe(2500);
    expect(result.grossSalary).toBe(2500 + 200 + 100 + 50);
  });
});

describe("computeEmployeeSalaryForSave — Store Keeper (untagged or Temporary)", () => {
  it("forces basicPay to 0 even when client sends it (untagged → temp behavior)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER" }),
      entry({ basicPay: 1234, workingHours: 180, hourlyWage: 6.5 }),
      null,
    );
    expect(result.basicPay).toBe(0);
    expect(result.workingHours).toBe(180);
    expect(result.hourlyWage).toBe(6.5);
    expect(result.grossSalary).toBe(180 * 6.5);
  });

  it("Temporary subtype computes gross as units × rate + allowances", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER", subtype: "TEMPORARY" }),
      entry({
        workingHours: 160,
        hourlyWage: 10,
        petrolAllowance: 100,
        kpiAllowance: 50,
        otherAllowance: 20,
      }),
      null,
    );
    expect(result.grossSalary).toBe(160 * 10 + 100 + 50 + 20);
  });

  it("Temporary subtype + day mode reuses the same units × rate math (label-only change)", () => {
    // Day mode is purely a payslip-label distinction — math identical.
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER", subtype: "TEMPORARY" }),
      entry({ workingHours: 22, hourlyWage: 100 }),
      null,
    );
    expect(result.grossSalary).toBe(22 * 100);
  });
});

describe("computeEmployeeSalaryForSave — Store Keeper (Permanent)", () => {
  it("forces workingHours and hourlyWage to 0 — basicPay drives gross like Sup/Admin", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER", subtype: "PERMANENT" }),
      entry({ basicPay: 3500, workingHours: 200, hourlyWage: 9, petrolAllowance: 150 }),
      null,
    );
    expect(result.basicPay).toBe(3500);
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    // 3500 + 150 — OT contribution from workingHours × hourlyWage excluded
    expect(result.grossSalary).toBe(3650);
  });

  it("Permanent subtype combines basicPay with allowances", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER", subtype: "PERMANENT" }),
      entry({
        basicPay: 4000,
        petrolAllowance: 200,
        kpiAllowance: 300,
        otherAllowance: 100,
      }),
      null,
    );
    expect(result.grossSalary).toBe(4000 + 200 + 300 + 100);
  });
});

describe("computeEmployeeSalaryForSave — Admin subtype", () => {
  it("Temporary Admin computes gross as units × rate + allowances (mirrors Temp SK)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: "TEMPORARY" }),
      entry({
        basicPay: 9999, // forced to 0
        workingHours: 160,
        hourlyWage: 12,
        petrolAllowance: 100,
        kpiAllowance: 50,
      }),
      null,
    );
    expect(result.basicPay).toBe(0);
    expect(result.workingHours).toBe(160);
    expect(result.hourlyWage).toBe(12);
    expect(result.grossSalary).toBe(160 * 12 + 100 + 50);
  });

  it("Temporary Admin defaults payMode to HOUR when omitted", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: "TEMPORARY" }),
      entry({ workingHours: 8, hourlyWage: 50 }),
      null,
    );
    expect(result.payMode).toBe("HOUR");
  });

  it("Temporary Admin honours DAY payMode (label-only — math identical)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: "TEMPORARY" }),
      entry({ workingHours: 22, hourlyWage: 100, payMode: "DAY" }),
      null,
    );
    expect(result.payMode).toBe("DAY");
    expect(result.grossSalary).toBe(22 * 100);
  });

  it("Permanent Admin uses basicPay path (today's behaviour)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: "PERMANENT" }),
      entry({ basicPay: 4000, workingHours: 200, hourlyWage: 30 }),
      null,
    );
    expect(result.basicPay).toBe(4000);
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    expect(result.grossSalary).toBe(4000);
    expect(result.payMode).toBe(null);
  });

  it("Untagged Admin (subtype = null) uses basicPay path — back-compat with existing rows", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: null }),
      entry({ basicPay: 3500, workingHours: 100, hourlyWage: 40 }),
      null,
    );
    expect(result.basicPay).toBe(3500);
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    expect(result.grossSalary).toBe(3500);
  });

  it("Temporary Admin combined with dispatcher record sums dispatcher gross into totalGross", () => {
    const dispatcherRecord: DispatcherRecordForSave = {
      baseSalary: 800,
      bonusTierEarnings: 50,
      petrolSubsidy: 30,
      penalty: 0,
      advance: 0,
    };
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ADMIN", subtype: "TEMPORARY" }),
      entry({ workingHours: 160, hourlyWage: 10, petrolAllowance: 50 }),
      dispatcherRecord,
    );
    // employeeGross = 160*10 + 50 = 1650; dispatcherGross = 800+50+30 = 880; total = 2530
    expect(result.grossSalary).toBe(2530);
  });
});

describe("computeEmployeeSalaryForSave — statutory overrides", () => {
  it("respects an explicit zero for epfEmployee (cleared by user)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 5000, epfEmployee: 0 }),
      null,
    );
    expect(result.epfEmployee).toBe(0);
  });

  it("auto-computes epfEmployee when omitted from payload", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 5000 }),
      null,
    );
    // 11% on RM20-ceiling of 5000 = 5000 × 0.11 = 550
    expect(result.epfEmployee).toBe(550);
  });

  it("respects each statutory override independently", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({
        basicPay: 5000,
        epfEmployee: 100,
        socsoEmployee: 25,
        eisEmployee: 7,
        epfEmployer: 110,
        socsoEmployer: 50,
        eisEmployer: 8,
      }),
      null,
    );
    expect(result.epfEmployee).toBe(100);
    expect(result.socsoEmployee).toBe(25);
    expect(result.eisEmployee).toBe(7);
    expect(result.epfEmployer).toBe(110);
    expect(result.socsoEmployer).toBe(50);
    expect(result.eisEmployer).toBe(8);
  });
});

describe("computeEmployeeSalaryForSave — combined with dispatcher", () => {
  const dispatcherRecord: DispatcherRecordForSave = {
    baseSalary: 800,
    bonusTierEarnings: 50,
    petrolSubsidy: 30,
    penalty: 20,
    advance: 100,
  };

  it("includes dispatcher gross in totalGross used for statutory + net", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 3000, petrolAllowance: 100 }),
      dispatcherRecord,
    );
    // employeeGross = 3000 + 100 = 3100; dispatcherGross = 800+50+30 = 880; total = 3980
    expect(result.grossSalary).toBe(3980);
  });

  it("combines dispatcher penalty/advance with employee values into the persisted columns", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 3000, penalty: 15, advance: 50 }),
      dispatcherRecord,
    );
    // penalty: 15 (employee) + 20 (dispatcher) = 35
    // advance: 50 (employee) + 100 (dispatcher) = 150
    expect(result.penalty).toBe(35);
    expect(result.advance).toBe(150);
  });

  it("net salary subtracts EPF/SOCSO/EIS/PCB/penalty/advance from totalGross", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({
        basicPay: 3000,
        pcb: 25,
        penalty: 15,
        advance: 50,
        epfEmployee: 200,
        socsoEmployee: 30,
        eisEmployee: 10,
      }),
      dispatcherRecord,
    );
    // gross = 3000 + 880 (dispatcher) = 3880
    // combined penalty 35, advance 150
    // net = 3880 - 200 - 30 - 10 - 25 - 35 - 150 = 3430
    expect(result.netSalary).toBe(3430);
  });
});

describe("computeEmployeeSalaryForSave — OT allowance", () => {
  it("includes OT in gross for Sup/Admin alongside other allowances", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({
        basicPay: 3000,
        petrolAllowance: 100,
        kpiAllowance: 200,
        otAllowance: 150,
        otherAllowance: 50,
      }),
      null,
    );
    expect(result.otAllowance).toBe(150);
    expect(result.grossSalary).toBe(3000 + 100 + 200 + 150 + 50);
  });

  it("includes OT in gross for Temporary Store Keeper (units-rate branch)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER", subtype: "TEMPORARY" }),
      entry({
        workingHours: 160,
        hourlyWage: 10,
        petrolAllowance: 0,
        kpiAllowance: 0,
        otAllowance: 200,
        otherAllowance: 0,
      }),
      null,
    );
    expect(result.otAllowance).toBe(200);
    expect(result.grossSalary).toBe(160 * 10 + 200);
  });

  it("OT does NOT count toward the KWSP p.12 bonus rule (only KPI does)", () => {
    // basicPay 4900 + ot 200 → gross 5100. Base wage (gross − KPI) = 5100 ≠ ≤ 5000,
    // so the bonus rule must NOT fire even though gross crossed the 5k threshold.
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 4900, otAllowance: 200 }),
      null,
    );
    // 12% rate (over 5k, no bonus rule) → ceil(5100 × 0.12) on RM100 bracket = 612
    expect(result.epfEmployer).toBe(612);
    expect(result.epfEmployee).toBe(561);
  });

  it("defaults to 0 otAllowance when omitted from payload (back-compat)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({ basicPay: 3000 }),
      null,
    );
    expect(result.otAllowance).toBe(0);
    expect(result.grossSalary).toBe(3000);
  });
});

describe("computeEmployeeSalaryForSave — new positions (universal subtype gate)", () => {
  // Contract: subtype = TEMPORARY on ANY role routes to the units × rate
  // branch (hours/days × rate). PERMANENT or null on any non-SK role uses
  // basicPay. If a future spec reverts this to metadata-only, these tests
  // must be updated together — they are the contractual fence for the
  // coupling decision.

  it("MARKETING + null subtype routes to basicPay branch (workingHours/hourlyWage forced to 0)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "MARKETING", subtype: null }),
      entry({ basicPay: 3500, workingHours: 8, hourlyWage: 50, petrolAllowance: 200 }),
      null,
    );
    expect(result.basicPay).toBe(3500);
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    expect(result.grossSalary).toBe(3700);
  });

  it("MARKETING + TEMPORARY routes to units × rate (subtype flips pay model on every type)", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "MARKETING", subtype: "TEMPORARY" }),
      entry({ basicPay: 9999, workingHours: 160, hourlyWage: 10, petrolAllowance: 100 }),
      null,
    );
    expect(result.basicPay).toBe(0);
    expect(result.workingHours).toBe(160);
    expect(result.hourlyWage).toBe(10);
    expect(result.grossSalary).toBe(160 * 10 + 100);
    expect(result.payMode).toBe("HOUR");
  });

  it("ASSISTANT + PERMANENT uses basicPay branch", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ASSISTANT", subtype: "PERMANENT" }),
      entry({ basicPay: 2800, kpiAllowance: 100 }),
      null,
    );
    expect(result.basicPay).toBe(2800);
    expect(result.grossSalary).toBe(2900);
    expect(result.payMode).toBe(null);
  });

  it("QUALITY_CONTROL + TEMPORARY routes to units × rate", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "QUALITY_CONTROL", subtype: "TEMPORARY" }),
      entry({ basicPay: 9999, workingHours: 200, hourlyWage: 25, petrolAllowance: 100, otAllowance: 50, payMode: "DAY" }),
      null,
    );
    expect(result.basicPay).toBe(0);
    expect(result.workingHours).toBe(200);
    expect(result.hourlyWage).toBe(25);
    expect(result.grossSalary).toBe(200 * 25 + 100 + 50);
    expect(result.payMode).toBe("DAY");
  });

  it("ACCOUNT_EXECUTIVE + null uses basicPay branch", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ACCOUNT_EXECUTIVE", subtype: null }),
      entry({ basicPay: 5500, kpiAllowance: 500 }),
      null,
    );
    expect(result.basicPay).toBe(5500);
    expect(result.grossSalary).toBe(6000);
    expect(result.payMode).toBe(null);
  });

  it("ACCOUNT_EXECUTIVE + TEMPORARY routes to units × rate", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "ACCOUNT_EXECUTIVE", subtype: "TEMPORARY" }),
      entry({ workingHours: 22, hourlyWage: 150, petrolAllowance: 50, payMode: "DAY" }),
      null,
    );
    expect(result.workingHours).toBe(22);
    expect(result.hourlyWage).toBe(150);
    expect(result.grossSalary).toBe(22 * 150 + 50);
    expect(result.payMode).toBe("DAY");
  });
});

describe("computeEmployeeSalaryForSave — Sup/Admin with legacy OT data on payload", () => {
  it("normalizes a previously-saved OT-hours record on the next save", () => {
    // Simulates the case where the client loaded an old record with
    // workingHours=8 and hourlyWage=50, and Confirm & Save fires.
    const result = computeEmployeeSalaryForSave(
      emp({ type: "SUPERVISOR" }),
      entry({
        basicPay: 3000,
        workingHours: 8,
        hourlyWage: 50,
        petrolAllowance: 100,
        kpiAllowance: 0,
        otherAllowance: 0,
      }),
      null,
    );
    expect(result.workingHours).toBe(0);
    expect(result.hourlyWage).toBe(0);
    expect(result.grossSalary).toBe(3100); // 3000 + 100, no OT
  });
});
