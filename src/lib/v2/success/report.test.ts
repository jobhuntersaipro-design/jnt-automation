import { describe, expect, it } from "vitest";
import { planReport, readReport } from "./report";

describe("J&T success-rate report", () => {
  it("finds the header under a title in Chinese and reads percentages", () => {
    const sheet = {
      name: "10月签收率",
      rows: [
        ["PHG415 派件员签收率 2026年10月"],
        ["网点", "派件员编号", "派件员姓名", "派件量", "签收量", "签收率"],
        ["PHG415", "phg4150001", "Ahmad Faiz", "1,200", "1,176", "98.00%"],
        ["PHG415", "PHG4150002", "Tan Danial", "800", "760", "95%"],
        ["合计", "", "", "2000", "1936", "96.8%"],
      ],
    };
    const plan = planReport([sheet])!;
    expect(plan).toEqual({ sheet: "10月签收率", headerRow: 1, columns: { outlet: 0, extId: 1, name: 2, total: 3, delivered: 4, rate: 5 } });
    const { rows, skipped } = readReport(sheet, plan);
    expect(rows.map((r) => [r.extId, r.rateBp, r.delivered, r.total, r.outlet])).toEqual([
      ["PHG4150001", 9800, 1176, 1200, "PHG415"],
      ["PHG4150002", 9500, 760, 800, "PHG415"],
    ]);
    expect(skipped).toEqual([]);
  });

  it("reads fractions, and works the rate out from delivered and total", () => {
    const fractions = { name: "S", rows: [["Courier ID", "Success Rate"], ["KUL1", "0.9785"], ["KUL2", "1"]] };
    expect(readReport(fractions, planReport([fractions])!).rows.map((r) => r.rateBp)).toEqual([9785, 10000]);
    const counts = { name: "S", rows: [["Dispatcher ID", "Delivered", "Total parcels"], ["KUL1", "97", "100"], ["KUL2", "x", "100"]] };
    const read = readReport(counts, planReport([counts])!);
    expect(read.rows.map((r) => [r.extId, r.rateBp])).toEqual([["KUL1", 9700]]);
    expect(read.skipped).toEqual([3]);
  });

  it("gives up on a sheet without a J&T ID or a rate", () => {
    expect(planReport([{ name: "x", rows: [["Name", "Branch"], ["A", "B"]] }])).toBeNull();
  });
});
