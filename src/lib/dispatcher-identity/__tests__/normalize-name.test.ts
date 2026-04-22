import { describe, it, expect } from "vitest";
import { normalizeName } from "../normalize-name";

describe("normalizeName", () => {
  it("uppercases a plain name", () => {
    expect(normalizeName("Ahmad Kamarul")).toBe("AHMAD KAMARUL");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeName("  Ahmad Kamarul  ")).toBe("AHMAD KAMARUL");
  });

  it("collapses multiple internal spaces into one", () => {
    expect(normalizeName("Ahmad     Kamarul")).toBe("AHMAD KAMARUL");
  });

  it("collapses tabs and newlines as whitespace", () => {
    expect(normalizeName("Ahmad\tKamarul\nAffiza")).toBe(
      "AHMAD KAMARUL AFFIZA",
    );
  });

  it("handles already-normalized input idempotently", () => {
    const input = "AHMAD KAMARUL AFFIZA";
    expect(normalizeName(input)).toBe(input);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeName("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeName("   \t\n  ")).toBe("");
  });

  it("preserves Malaysian naming particles verbatim", () => {
    // This is a deliberate non-feature — we do not try to normalize
    // "bin" vs "b." or "binti" vs "bt." variants. The spec acknowledges
    // this as a known limitation of v1 matching.
    expect(normalizeName("Ahmad bin Abdullah")).toBe("AHMAD BIN ABDULLAH");
    expect(normalizeName("Siti binti Ibrahim")).toBe("SITI BINTI IBRAHIM");
  });

  it("preserves punctuation (dots, commas, hyphens)", () => {
    expect(normalizeName("Ahmad B. Abdullah")).toBe("AHMAD B. ABDULLAH");
    expect(normalizeName("Ali-Muhammad")).toBe("ALI-MUHAMMAD");
  });

  it("uppercases non-ASCII Latin characters", () => {
    expect(normalizeName("José García")).toBe("JOSÉ GARCÍA");
  });
});
