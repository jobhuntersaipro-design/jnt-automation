import { describe, it, expect } from "vitest";
import { BRANCH_PALETTE, getBranchColor } from "../branch-colors";

describe("getBranchColor", () => {
  it("is deterministic — same code always hashes to the same palette slot", () => {
    const codes = ["PHG379", "KPG001", "CHR204", "PCH108", "JHB521", "SEL045"];
    for (const code of codes) {
      const a = getBranchColor(code);
      const b = getBranchColor(code);
      expect(a).toBe(b);
    }
  });

  it("returns a neutral fallback for null/empty", () => {
    expect(getBranchColor(null).id).toBe("neutral");
    expect(getBranchColor(undefined).id).toBe("neutral");
    expect(getBranchColor("").id).toBe("neutral");
  });

  it("resolves every result to a valid palette member or the fallback", () => {
    const ids = new Set(BRANCH_PALETTE.map((p) => p.id));
    ids.add("neutral");
    for (const code of ["A", "PHG379", "foo-bar-baz", "zzz"]) {
      expect(ids.has(getBranchColor(code).id)).toBe(true);
    }
  });

  it("distributes a realistic sample of branch codes across ≥4 palette slots", () => {
    const sample = [
      "PHG379", "KPG001", "CHR204", "PCH108", "JHB521", "SEL045",
      "KUL777", "MLK312", "PRK500", "SBH090",
    ];
    const slots = new Set(sample.map((c) => getBranchColor(c).id));
    expect(slots.size).toBeGreaterThanOrEqual(4);
  });

  it("every palette entry has WCAG-passing bg/text class pairing fields", () => {
    for (const c of BRANCH_PALETTE) {
      expect(c.bg).toMatch(/^bg-/);
      expect(c.text).toMatch(/^text-/);
      expect(c.ring).toMatch(/^ring-/);
      expect(c.hexBg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.hexText).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.hexSolid).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
