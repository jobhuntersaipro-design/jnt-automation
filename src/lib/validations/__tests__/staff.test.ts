import { describe, it, expect } from "vitest";
import { recalculateBodySchema } from "../staff";

describe("recalculateBodySchema", () => {
  const baseBody = {
    salaryRecordId: "rec_1",
    updatedSnapshot: {},
  };

  it("accepts a body with no adjustments", () => {
    expect(recalculateBodySchema.safeParse(baseBody).success).toBe(true);
  });

  it("accepts a body with partial adjustments (penalty only)", () => {
    const parsed = recalculateBodySchema.safeParse({
      ...baseBody,
      adjustments: { penalty: 12.34 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.adjustments?.penalty).toBe(12.34);
      expect(parsed.data.adjustments?.commission).toBeUndefined();
    }
  });

  it("accepts a body with all three adjustments", () => {
    const parsed = recalculateBodySchema.safeParse({
      ...baseBody,
      adjustments: { commission: 50, penalty: 10, advance: 5 },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative penalty", () => {
    expect(
      recalculateBodySchema.safeParse({
        ...baseBody,
        adjustments: { penalty: -1 },
      }).success,
    ).toBe(false);
  });

  it("rejects negative commission", () => {
    expect(
      recalculateBodySchema.safeParse({
        ...baseBody,
        adjustments: { commission: -0.01 },
      }).success,
    ).toBe(false);
  });

  it("rejects negative advance", () => {
    expect(
      recalculateBodySchema.safeParse({
        ...baseBody,
        adjustments: { advance: -100 },
      }).success,
    ).toBe(false);
  });

  it("rejects amounts above the 100_000 ceiling", () => {
    expect(
      recalculateBodySchema.safeParse({
        ...baseBody,
        adjustments: { commission: 100_001 },
      }).success,
    ).toBe(false);
  });

  it("rejects non-numeric adjustment values", () => {
    expect(
      recalculateBodySchema.safeParse({
        ...baseBody,
        adjustments: { penalty: "10" as unknown as number },
      }).success,
    ).toBe(false);
  });
});
