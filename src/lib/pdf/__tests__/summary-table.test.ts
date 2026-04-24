import { describe, it, expect } from "vitest";
import { renderSummaryTablePdf } from "../summary-table";

describe("renderSummaryTablePdf", () => {
  it("returns a Node Buffer with the PDF signature", async () => {
    const buf = await renderSummaryTablePdf({
      title: "Test Export",
      subtitle: "Smoke test",
      columns: [
        { label: "Name", flex: 2 },
        { label: "Amount", align: "right", tabular: true },
      ],
      rows: [["Ahmad Bin Hamid", "1,234.56"]],
      footer: ["TOTAL", "1,234.56"],
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.subarray(buf.length - 6).toString("ascii")).toContain("%%EOF");
  });

  it("paginates when rows exceed one page", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Row ${i + 1}`, String(i)]);
    const buf = await renderSummaryTablePdf({
      title: "Long",
      columns: [{ label: "Name" }, { label: "N", align: "right", tabular: true }],
      rows,
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    // Multi-page PDFs include multiple /Page objects in their catalog.
    const text = buf.toString("latin1");
    const pageMatches = text.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageMatches.length).toBeGreaterThan(1);
  });

  it("handles an empty rows array without crashing", async () => {
    const buf = await renderSummaryTablePdf({
      title: "Empty",
      columns: [{ label: "A" }, { label: "B" }],
      rows: [],
    });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
