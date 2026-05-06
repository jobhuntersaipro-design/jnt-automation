import { describe, it, expect } from "vitest";
import { formatIc, formatIcInput } from "./ic";

describe("formatIc", () => {
  it("formats a 12-digit IC as YYMMDD-PB-####", () => {
    expect(formatIc("900101101234")).toBe("900101-10-1234");
    expect(formatIc("000229014567")).toBe("000229-01-4567");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(formatIc(null)).toBe("");
    expect(formatIc(undefined)).toBe("");
    expect(formatIc("")).toBe("");
  });

  it("returns partial input as-is (caller renders incomplete state)", () => {
    expect(formatIc("12345")).toBe("12345");
    expect(formatIc("1234567890123")).toBe("1234567890123");
  });

  it("returns non-digit input as-is", () => {
    expect(formatIc("12345678901a")).toBe("12345678901a");
    expect(formatIc("not-an-ic")).toBe("not-an-ic");
  });
});

describe("formatIcInput", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(formatIcInput(null)).toBe("");
    expect(formatIcInput(undefined)).toBe("");
    expect(formatIcInput("")).toBe("");
  });

  it("preserves digits-only up to 6 chars unchanged", () => {
    expect(formatIcInput("1")).toBe("1");
    expect(formatIcInput("123456")).toBe("123456");
  });

  it("inserts first hyphen after 6 digits", () => {
    expect(formatIcInput("1234567")).toBe("123456-7");
    expect(formatIcInput("12345678")).toBe("123456-78");
  });

  it("inserts second hyphen after 8 digits", () => {
    expect(formatIcInput("123456789")).toBe("123456-78-9");
    expect(formatIcInput("123456789012")).toBe("123456-78-9012");
  });

  it("strips non-digit characters", () => {
    expect(formatIcInput("123-456-789")).toBe("123456-78-9");
    expect(formatIcInput("a1b2c3d4e5f6")).toBe("123456");
  });

  it("clamps to 12 digits maximum", () => {
    expect(formatIcInput("1234567890123456")).toBe("123456-78-9012");
  });
});
