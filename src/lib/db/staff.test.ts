import { describe, it, expect } from "vitest";
import { computeIsComplete, maskIc } from "./staff";

describe("computeIsComplete", () => {
  it("returns true when name, icNo, and extId are all present", () => {
    expect(computeIsComplete("Ali", "990101145678", "D001")).toBe(true);
  });

  it("returns false when name is empty", () => {
    expect(computeIsComplete("", "990101145678", "D001")).toBe(false);
  });

  it("returns true when icNo is empty (IC is optional)", () => {
    expect(computeIsComplete("Ali", "", "D001")).toBe(true);
  });

  it("returns false when extId is empty", () => {
    expect(computeIsComplete("Ali", "990101145678", "")).toBe(false);
  });

  it("returns false when all fields are empty", () => {
    expect(computeIsComplete("", "", "")).toBe(false);
  });
});

describe("maskIc", () => {
  it("masks a 12-digit IC showing only last 4 digits", () => {
    expect(maskIc("990101145678")).toBe("••••••••5678");
  });

  it("masks a 6-char string showing last 4", () => {
    expect(maskIc("123456")).toBe("••3456");
  });

  it("returns as-is when 4 chars or fewer", () => {
    expect(maskIc("1234")).toBe("1234");
    expect(maskIc("12")).toBe("12");
    expect(maskIc("")).toBe("");
  });
});
