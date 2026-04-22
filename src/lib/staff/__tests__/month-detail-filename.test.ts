import { describe, it, expect } from "vitest";
import { monthDetailFilename } from "../month-detail-filename";

describe("monthDetailFilename", () => {
  it("formats year_month_name with 0-padded month", () => {
    expect(monthDetailFilename(2026, 2, "Alice", "csv")).toBe("2026_02_Alice.csv");
    expect(monthDetailFilename(2026, 12, "Bob", "pdf")).toBe("2026_12_Bob.pdf");
  });

  it("replaces spaces in name with dashes", () => {
    expect(monthDetailFilename(2026, 2, "ABDUL HAFIZ BIN YUSOF", "csv")).toBe(
      "2026_02_ABDUL-HAFIZ-BIN-YUSOF.csv",
    );
  });

  it("strips filesystem-unsafe characters", () => {
    expect(monthDetailFilename(2026, 2, "A/B\\C:D*E?F\"G<H>I|J", "pdf")).toBe(
      "2026_02_ABCDEFGHIJ.pdf",
    );
  });

  it("collapses runs of whitespace into a single dash", () => {
    expect(monthDetailFilename(2026, 2, "A\t B\nC", "csv")).toBe("2026_02_A-B-C.csv");
  });

  it("trims leading/trailing whitespace", () => {
    expect(monthDetailFilename(2026, 2, "  Alice  ", "csv")).toBe("2026_02_Alice.csv");
  });
});
