import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every text colour in the v2 tokens must clear WCAG AA (4.5:1) on every surface.
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
const token = (name: string) => {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`--${name} is not a 6-digit hex in tokens.css`);
  return match[1];
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ["foreground", "text-secondary", "text-muted", "accent", "accent-strong", "success", "warning", "danger"];
const SURFACES = ["background", "surface", "surface-muted"];

describe("v2 tokens contrast", () => {
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      it(`${text} on ${surface} >= 4.5:1`, () => {
        expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("accent-foreground on accent >= 4.5:1", () => {
    expect(contrast(token("accent-foreground"), token("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});
