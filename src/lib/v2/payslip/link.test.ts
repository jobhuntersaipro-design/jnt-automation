import { describe, expect, it } from "vitest";
import { payslipToken, readPayslipToken } from "./link";

describe("payslip links", () => {
  it("round-trips and refuses changed or made-up tokens", () => {
    const token = payslipToken("res123", "s3cret");
    expect(readPayslipToken(token, "s3cret")).toBe("res123");
    expect(readPayslipToken(token.replace("res123", "res124"), "s3cret")).toBeNull();
    expect(readPayslipToken(token, "other")).toBeNull();
    expect(readPayslipToken("res123", "s3cret")).toBeNull();
    expect(readPayslipToken(`${token}.x`, "s3cret")).toBeNull();
  });
});
