import { describe, it, expect } from "vitest";
import {
  generateEmployeePayslipPdf,
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
