import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { zh } from "@/lib/i18n/zh";
import { blankConfig, type RuleConfig } from "./config";
import { configToRows, FIELDS, findHeader, guessMapping, isHeaderRow, parseCsv, parseNumber, parseRange, rowsToConfig, toCsv, type Field } from "./rate-card-io";
import { TEMPLATES } from "./templates";

const BASE = { unit: "parcels", basis: "whole", valueType: "per_unit" } as const;

/** What the import dialog does with a file's text. */
function load(csv: string, base: Pick<RuleConfig, "unit" | "basis" | "valueType"> = BASE) {
  const rows = parseCsv(csv);
  const header = findHeader(rows);
  return rowsToConfig(rows.slice(header + 1), guessMapping(rows[header]), base, header + 2);
}
const issues = (list: { row: number | null; key: string }[]) => list.map((i) => [i.row, i.key]);
const headersIn = (messages: Record<string, string>) => Object.fromEntries(FIELDS.map((f) => [f, messages[`import.col.${f}`]])) as Record<Field, string>;

describe("parseCsv", () => {
  it("drops a BOM, detects semicolons, keeps quoted delimiters, quotes and blank lines", () => {
    expect(parseCsv('﻿a;b\n"x;y";"say ""hi"""\n\n1;2\r\n')).toEqual([["a", "b"], ["x;y", 'say "hi"'], [""], ["1", "2"]]);
  });

  it("detects tabs and reads a last line without a newline", () => {
    expect(parseCsv("a\tb\r\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("writes CSV that reads back the same", () => {
    const rows = [["Weight, kg", 'say "hi"'], ["0", "1.4"]];
    expect(toCsv(rows).startsWith("﻿")).toBe(true);
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parseNumber", () => {
  it.each([
    ["RM 1,234.50", 1234.5],
    [" 1.2 kg ", 1.2],
    [".5", 0.5],
    ["1.", 1],
    ["2,601", 2601],
    ["0", 0],
  ])("reads %j", (text, n) => expect(parseNumber(text)).toBe(n));

  it.each(["", "abc", "1,20", "-1", "1.2.3", "—", "1e5"])("rejects %j", (text) => expect(parseNumber(text)).toBeNaN());
});

describe("parseRange", () => {
  it.each([
    ["5.01 - 10 kg", { from: 5.01, to: 10 }],
    ["1,401–2,600", { from: 1401, to: 2600 }],
    ["0～5公斤", { from: 0, to: 5 }],
    ["5 to 10", { from: 5, to: 10 }],
    ["10 kg+", { from: 10, to: null }],
    ["10.01kg and above", { from: 10.01, to: null }],
    [">10", { from: 10, to: null }],
    ["2601 以上", { from: 2601, to: null }],
    ["2,601及以上", { from: 2601, to: null }],
    ["≤5", { from: 0, to: 5 }],
    ["up to 5 kg", { from: 0, to: 5 }],
    ["5公斤以内", { from: 0, to: 5 }],
  ])("reads %j", (text, range) => expect(parseRange(text)).toEqual(range));

  // "<5" excludes 5, but bands include their upper edge, so it must be written as ≤ or a range.
  it.each(["5", "<5", "heavy", "1-2-3", ""])("rejects %j", (text) => expect(parseRange(text)).toBeNull());
});

describe("guessMapping and findHeader", () => {
  it("maps the export headers in both languages", () => {
    const byVehicle: Field[] = ["tierFrom", "tierTo", "weightFrom", "weightTo", "bike", "car", "lorry"];
    for (const messages of [en, zh]) {
      const h = headersIn(messages);
      expect(guessMapping(byVehicle.map((f) => h[f]))).toEqual({ ...Object.fromEntries(byVehicle.map((f, i) => [f, i])), rate: -1 });
      expect(guessMapping([h.weightFrom, h.weightTo, h.rate])).toMatchObject({ weightFrom: 0, weightTo: 1, rate: 2, bike: -1, tierFrom: -1 });
    }
  });

  it("maps a hand-made sheet with one range column", () => {
    const m = guessMapping(["Weight (kg)", "Remarks", "Motorbike", "Car", "Lorry"]);
    expect(m).toMatchObject({ weightFrom: 0, weightTo: -1, bike: 2, car: 3, lorry: 4, rate: -1, tierFrom: -1 });
    expect(guessMapping(["每月单量", "费率"])).toMatchObject({ tierFrom: 0, rate: 1, weightFrom: -1 });
  });

  it("skips a title row, even one merged across columns", () => {
    const rows = [["ST RATE CARD 2026", "ST RATE CARD 2026"], [], ["Weight", "Rate (RM)"], ["0-5", "1"]];
    expect(findHeader(rows)).toBe(2);
    expect(isHeaderRow(["费率自 2026 年 12 月起生效"])).toBe(false);
  });
});

describe("rowsToConfig", () => {
  it("reads a rate card with range cells and a rate per vehicle, in any row order", () => {
    const r = load(["Weight (kg),Bike,Car,Lorry", "10.01+,2.20,2.50,3", "0 - 5,RM 1.00,1.20,1.50", "5.01 - 10,1.40,1.60,2"].join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.config).toEqual({
      ...BASE,
      tiers: [null],
      bands: [5, 10, null],
      byVehicle: true,
      values: [[[1, 1.2, 1.5], [1.4, 1.6, 2], [2.2, 2.5, 3]]],
    });
  });

  it("reads a single rate column and upper edges only", () => {
    const r = load(["Weight to (kg),Rate", "5,1", "10,1.4", ",2.2"].join("\n"));
    expect(r.config).toMatchObject({ bands: [5, 10, null], byVehicle: false, values: [[[1], [1.4], [2.2]]] });
  });

  it("adds an RM 0 tier when a KPI card starts above 1 parcel", () => {
    const csv = [
      "Parcels from,Parcels to,Weight from (kg),Weight to (kg),Rate (RM)",
      "1401,2600,0,5,0.10",
      "1401,2600,5.01,,0.20",
      "2601,,0,5,0.15",
      "2601,,5.01,,0.30",
    ].join("\n");
    const r = load(csv, { ...BASE, basis: "marginal" });
    expect(r.errors).toEqual([]);
    expect(issues(r.warnings)).toEqual([[2, "import.warn.tierStart"]]);
    expect(r.warnings[0].vars).toEqual({ from: 1401, to: 1400 });
    expect(r.config).toEqual({
      ...BASE,
      basis: "marginal",
      tiers: [1400, 2600, null],
      bands: [5, null],
      byVehicle: false,
      values: [[[0], [0]], [[0.1], [0.2]], [[0.15], [0.3]]],
    });
  });

  it("opens a last range that has an upper limit, with a warning", () => {
    const r = load(["Weight,Rate", "1 - 5,1", "5.01 - 20,2"].join("\n"));
    expect(r.config?.bands).toEqual([5, null]);
    expect(issues(r.warnings)).toEqual([
      [3, "import.warn.bandOpened"],
      [2, "import.warn.bandStart"],
    ]);
  });

  it("keeps sheet row numbers across blank lines and notes", () => {
    const r = load(["Title only", "Weight,Rate,Notes", "0-5,1,", "", ",,Rates exclude SST", "5.01-10,abc,", "10.01+,2,"].join("\n"));
    expect(issues(r.errors)).toEqual([[6, "import.err.rate"]]);
    expect(r.errors[0].vars).toEqual({ value: "abc" });
  });

  it.each([
    ["a gap", ["0-5,1", "6-10,2", "10.01+,3"], [[3, "import.err.bandGap"]]],
    ["an overlap", ["0-5,1", "4-10,2", "10.01+,3"], [[3, "import.err.overlap"]]],
    ["the same band twice", ["0-5,1", "0-5,1.2", "5.01+,3"], [[3, "import.err.overlap"]]],
    ["two open bands", ["0-5,1", "5.01+,2", "10.01+,3"], [[4, "import.err.twoOpen"]]],
    ["a backwards range", ["10-5,1", "10.01+,2"], [[2, "import.err.backwards"]]],
    ["a decimal comma", ["0-5,\"1,20\"", "5.01+,2"], [[2, "import.err.rate"]]],
    ["5 rate decimals", ["0-5,1.23456", "5.01+,2"], [[2, "import.err.rate"]]],
    ["4 weight decimals", ["0-5.0001,1", "5.0002+,2"], [[2, "import.err.weightRange"], [3, "import.err.weightRange"]]],
    ["an exclusive edge", ["<5,1", "5+,2"], [[2, "import.err.weightRange"]]],
  ])("reports %s with its row", (_, lines, expected) => {
    const r = load(["Weight,Rate", ...lines].join("\n"));
    expect(r.config).toBeNull();
    expect(issues(r.errors)).toEqual(expected);
  });

  it("reports what a gap is missing", () => {
    expect(load("Weight,Rate\n0-5,1\n6+,2").errors[0].vars).toEqual({ from: 5, to: 6 });
    expect(load("Parcels,Rate\n0-1400,0\n1500+,1").errors).toEqual([{ row: 3, key: "import.err.tierGap", vars: { from: 1400, to: 1500 } }]);
  });

  it("needs the same bands in every tier", () => {
    const csv = ["Parcels,Weight,Rate", "0-1400,0-5,0", "0-1400,5.01+,0", "1401+,0-10,1", "1401+,10.01+,2"].join("\n");
    expect(issues(load(csv).errors)).toEqual([[4, "import.err.bandsDiffer"]]);
  });

  it("rejects non-whole parcel counts", () => {
    expect(issues(load("Parcels,Rate\n0-1400.5,0\n1400.6+,1").errors)).toEqual([
      [2, "import.err.tierRange"],
      [3, "import.err.tierRange"],
    ]);
  });

  it.each([
    ["no rate column", "Weight,Notes\n0-5,x", "import.err.rateColumn"],
    ["a missing vehicle", "Weight,Bike,Car\n0-5,1,1", "import.err.vehicleColumns"],
    ["several rows and no ranges", "Rate\n1\n2", "import.err.noRanges"],
    ["no rows", "Weight,Rate\n\n", "import.err.empty"],
  ])("refuses a file with %s", (_, csv, key) => {
    expect(issues(load(csv).errors)).toEqual([[null, key]]);
  });

  it("refuses weight bands on a flat amount", () => {
    expect(issues(load("Weight,Amount\n0-5,10\n5.01+,20", { ...BASE, valueType: "flat" }).errors)).toEqual([[null, "rule.err.flatBands"]]);
  });

  it("reads one row with no ranges as one rate for everything", () => {
    expect(load("Rate (RM)\n0.25").config).toEqual(blankConfig({ values: [[[0.25]]] }));
  });
});

describe("configToRows", () => {
  const kpi: RuleConfig = { ...TEMPLATES.KPI, values: [[[0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0.1, 0.12, 0.15], [0.2, 0.22, 0.25], [0.3, 0.32, 0.35]], [[0.15, 0.17, 0.2], [0.25, 0.27, 0.3], [0.35, 0.37, 0.4]]] };
  const allowance: RuleConfig = { ...TEMPLATES.ALLOWANCE, tiers: [1000, null], values: [[[0]], [[150]]] };

  it.each([
    ["the rate card template", TEMPLATES.PARCEL],
    ["a KPI card", kpi],
    ["a flat allowance by count", allowance],
    ["a single fuel rate", { ...TEMPLATES.FUEL, values: [[[0.08]]] }],
  ])("round-trips %s through CSV in both languages", (_, config) => {
    for (const messages of [en, zh]) {
      const r = load(toCsv(configToRows(config, headersIn(messages))), config);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.config).toEqual(config);
    }
  });

  it("writes ranges the way people read them", () => {
    expect(configToRows(TEMPLATES.PARCEL, headersIn(en))).toEqual([
      ["Weight from (kg)", "Weight to (kg)", "Bike (RM)", "Car (RM)", "Lorry (RM)"],
      ["0", "5", "1", "1", "1"],
      ["5.01", "10", "1.4", "1.4", "1.4"],
      ["10.01", "", "2.2", "2.2", "2.2"],
    ]);
  });
});
