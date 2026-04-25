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

describe("computeEmployeeSalaryForSave — Store Keeper", () => {
  it("forces basicPay to 0 even when client sends it", () => {
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

  it("computes gross as hours × wage + allowances", () => {
    const result = computeEmployeeSalaryForSave(
      emp({ type: "STORE_KEEPER" }),
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
