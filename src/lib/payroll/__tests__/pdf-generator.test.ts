import { describe, it, expect } from "vitest";
import { generatePayslipPdf, type GeneratePayslipInput } from "../pdf-generator";

function baseInput(
  overrides: Partial<GeneratePayslipInput> = {},
): GeneratePayslipInput {
  return {
    companyName: "ST XIANG TRANSPORTATION SDN BHD",
    companyRegistrationNo: "202401013061",
    companyAddress: "Lot 456, Jalan Example\n50000 Kuala Lumpur",
    stampImageUrl: null,
    dispatcherName: "Ahmad Bin Hamid",
    icNo: "900101-10-1234",
    month: 3,
    year: 2026,
    petrolSubsidy: 45,
    commission: 0,
    penalty: 0,
    advance: 0,
    netSalary: 1543.2,
    lineItems: [
      { weight: 3.5, commission: 1, isBonusTier: false },
      { weight: 8, commission: 1.4, isBonusTier: false },
      { weight: 12, commission: 2.2, isBonusTier: true },
    ],
    weightTiersSnapshot: [
      { tier: 1, minWeight: 0, maxWeight: 5, commission: 1 },
      { tier: 2, minWeight: 5, maxWeight: 10, commission: 1.4 },
      { tier: 3, minWeight: 10, maxWeight: null, commission: 2.2 },
    ],
    bonusTierSnapshot: [
      { tier: 3, minWeight: 10, maxWeight: null, commission: 2.5 },
    ],
    ...overrides,
  };
}

describe("generatePayslipPdf", () => {
  it("returns a valid PDF buffer for a typical dispatcher", async () => {
    const buf = await generatePayslipPdf(baseInput());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1024);
  });

  it("renders penalty + advance in the deduction column when non-zero", async () => {
    const buf = await generatePayslipPdf(
      baseInput({ penalty: 50, advance: 100 }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("renders with no line items + no bonus tiers (empty dispatcher)", async () => {
    const buf = await generatePayslipPdf(
      baseInput({
        lineItems: [],
        petrolSubsidy: 0,
        netSalary: 0,
      }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("handles legacy records with empty bonusTierSnapshot", async () => {
    const buf = await generatePayslipPdf(
      baseInput({ bonusTierSnapshot: [] }),
    );
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
