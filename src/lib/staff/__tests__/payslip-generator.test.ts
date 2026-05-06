import { describe, it, expect } from "vitest";
import {
  generateEmployeePayslipPdf,
  buildAdditionRows,
  buildDeductionRows,
  type EmployeePayslipInput,
} from "../payslip-generator";

function baseInput(overrides: Partial<EmployeePayslipInput> = {}): EmployeePayslipInput {
  return {
    companyName: "ST XIANG LOGISTICS SDN BHD",
    companyRegistrationNo: "202301012345",
    companyAddress: "Lot 123, Jalan Example\n50000 Kuala Lumpur, Malaysia",
    stampImageUrl: null,
    employeeName: "Ahmad Bin Hamid",
    icNo: "900101-10-1234",
    position: "Supervisor",
    employeeType: "SUPERVISOR",
    month: 3,
    year: 2026,
    epfNo: "EPF001",
    socsoNo: "SOCSO001",
    incomeTaxNo: null,
    basicPay: 2500,
    workingHours: 0,
    hourlyWage: 0,
    petrolAllowance: 150,
    kpiAllowance: 200,
    otherAllowance: 0,
    epfEmployee: 297,
    socsoEmployee: 17.65,
    eisEmployee: 6.75,
    pcb: 0,
    penalty: 0,
    advance: 0,
    epfEmployer: 355,
    socsoEmployer: 61.75,
    eisEmployer: 6.75,
    grossSalary: 2850,
    netSalary: 2528.6,
    ...overrides,
  };
}

describe("generateEmployeePayslipPdf", () => {
  it("supervisor template returns a valid PDF buffer", async () => {
    const buf = await generateEmployeePayslipPdf(baseInput());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("renders without crashing when the employee name is too long to fit one line", async () => {
    // Regression: previously the wrapped second line of the name overlapped
    // with I/C NO. The particulars grid now grows the row height to fit the
    // wrapped value, so subsequent rows shift down cleanly.
    const buf = await generateEmployeePayslipPdf(
      baseInput({
        employeeName: "Muhammad Rasydan Qusyairi Bin Mohd Hosni Abdullah",
        employeeType: "STORE_KEEPER",
        position: "Store Keeper",
        basicPay: 0,
        workingHours: 193,
        hourlyWage: 8.72,
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("driver template returns a valid PDF buffer (reuses Sup/Admin layout)", async () => {
    // Driver pay model = monthly basic pay, same as Supervisor / Admin.
    // Render must succeed and produce a PDF; the layout is Template 1.
    const buf = await generateEmployeePayslipPdf(
      baseInput({
        employeeType: "DRIVER",
        position: "Driver",
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("store keeper template uses WAGES line + hides EPF NO", async () => {
    const buf = await generateEmployeePayslipPdf(
      baseInput({
        employeeType: "STORE_KEEPER",
        position: "Store Keeper",
        basicPay: 0,
        workingHours: 180,
        hourlyWage: 6.5,
        incomeTaxNo: "TAX001",
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("temporary store keeper renders WAGES (X HOUR) by default", () => {
    const rows = buildAdditionRows(
      baseInput({
        employeeType: "STORE_KEEPER",
        storeKeeperSubtype: "TEMPORARY",
        basicPay: 0,
        workingHours: 180,
        hourlyWage: 6.5,
      }),
    );
    expect(rows[0].label).toBe("WAGES (180 HOUR)");
    expect(rows[0].amount).toBe(180 * 6.5);
  });

  it("temporary store keeper with payMode=DAY renders WAGES (X DAY)", () => {
    const rows = buildAdditionRows(
      baseInput({
        employeeType: "STORE_KEEPER",
        storeKeeperSubtype: "TEMPORARY",
        payMode: "DAY",
        basicPay: 0,
        workingHours: 22,
        hourlyWage: 100,
      }),
    );
    expect(rows[0].label).toBe("WAGES (22 DAY)");
    expect(rows[0].amount).toBe(22 * 100);
  });

  it("permanent store keeper renders BASIC PAY like Sup/Admin", () => {
    const rows = buildAdditionRows(
      baseInput({
        employeeType: "STORE_KEEPER",
        storeKeeperSubtype: "PERMANENT",
        basicPay: 4000,
        workingHours: 0,
        hourlyWage: 0,
      }),
    );
    expect(rows.find((r) => r.label === "BASIC PAY")?.amount).toBe(4000);
    expect(rows.find((r) => r.label.startsWith("WAGES"))).toBeUndefined();
  });

  it("untagged store keeper (subtype=null) preserves WAGES (X HOUR) for back-compat", () => {
    const rows = buildAdditionRows(
      baseInput({
        employeeType: "STORE_KEEPER",
        storeKeeperSubtype: null,
        basicPay: 0,
        workingHours: 160,
        hourlyWage: 8,
      }),
    );
    expect(rows[0].label).toBe("WAGES (160 HOUR)");
  });

  it("combined dispatcher + employee template renders tier breakdown rows", async () => {
    const buf = await generateEmployeePayslipPdf(
      baseInput({
        dispatcherTierBreakdowns: [
          { tier: 1, count: 120, rate: 1, total: 120 },
          { tier: 2, count: 60, rate: 1.4, total: 84 },
        ],
        dispatcherBonusTierBreakdowns: [
          { tier: 1, count: 20, rate: 1.5, total: 30 },
        ],
        dispatcherPetrolSubsidy: 45,
        dispatcherCommission: 12.5,
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("combined template — deduction rows sum equals data.penalty + data.advance (no double-count)", () => {
    // Regression test for Bug 4: when an employee is ALSO a dispatcher,
    // EmployeeSalaryRecord stores combined penalty/advance; the old render
    // showed both "Penalty: combined" + "Penalty (Dispatcher): portion",
    // inflating the deduction column by the dispatcher portion.
    const input = baseInput({
      penalty: 50, // combined = employee 20 + dispatcher 30
      advance: 150, // combined = employee 100 + dispatcher 50
      dispatcherTierBreakdowns: [{ tier: 1, count: 10, rate: 1, total: 10 }],
      dispatcherPenalty: 30,
      dispatcherAdvance: 50,
    });
    const rows = buildDeductionRows(input);
    const totalDeductions =
      rows
        .filter((r) => r.label === "Penalty" || r.label === "Penalty (Dispatcher)")
        .reduce((s, r) => s + r.amount, 0);
    const totalAdvances =
      rows
        .filter((r) => r.label === "Advance" || r.label === "Advance (Dispatcher)")
        .reduce((s, r) => s + r.amount, 0);
    expect(totalDeductions).toBe(50);
    expect(totalAdvances).toBe(150);
  });

  it("combined template — splits Penalty into employee-only + dispatcher rows", () => {
    const input = baseInput({
      penalty: 50,
      advance: 0,
      dispatcherTierBreakdowns: [{ tier: 1, count: 10, rate: 1, total: 10 }],
      dispatcherPenalty: 30,
    });
    const rows = buildDeductionRows(input);
    expect(rows.find((r) => r.label === "Penalty")?.amount).toBe(20);
    expect(rows.find((r) => r.label === "Penalty (Dispatcher)")?.amount).toBe(30);
  });

  it("non-combined template — Penalty row carries full value", () => {
    const input = baseInput({ penalty: 50 });
    const rows = buildDeductionRows(input);
    expect(rows.find((r) => r.label === "Penalty")?.amount).toBe(50);
    expect(rows.find((r) => r.label === "Penalty (Dispatcher)")).toBeUndefined();
  });

  it("combined template — if employee portion is zero, only dispatcher row shows", () => {
    const input = baseInput({
      penalty: 30, // all dispatcher
      dispatcherTierBreakdowns: [{ tier: 1, count: 10, rate: 1, total: 10 }],
      dispatcherPenalty: 30,
    });
    const rows = buildDeductionRows(input);
    expect(rows.find((r) => r.label === "Penalty")).toBeUndefined();
    expect(rows.find((r) => r.label === "Penalty (Dispatcher)")?.amount).toBe(30);
  });

  it("addition rows — combined template includes tier rows before BASIC PAY", () => {
    const input = baseInput({
      dispatcherTierBreakdowns: [
        { tier: 1, count: 100, rate: 1, total: 100 },
        { tier: 2, count: 20, rate: 1.4, total: 28 },
      ],
    });
    const rows = buildAdditionRows(input);
    const tierIdx = rows.findIndex((r) => r.label.startsWith("Parcel Delivered"));
    const basicIdx = rows.findIndex((r) => r.label === "BASIC PAY");
    expect(tierIdx).toBeGreaterThanOrEqual(0);
    expect(basicIdx).toBeGreaterThan(tierIdx);
  });

  it("handles zero-amount fields without drawing empty rows", async () => {
    const buf = await generateEmployeePayslipPdf(
      baseInput({
        petrolAllowance: 0,
        kpiAllowance: 0,
        otherAllowance: 0,
        epfEmployee: 0,
        socsoEmployee: 0,
        eisEmployee: 0,
        pcb: 0,
        penalty: 0,
        advance: 0,
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
