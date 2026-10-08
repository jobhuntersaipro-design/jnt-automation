import { describe, expect, it } from "vitest";
import { filterRows, nextSort, parseAmount, sortRows, sumBy, toCsv } from "./table-logic";

const rows = [
  { id: "1", name: "Ali bin Abu", outlet: "KUL4602", parcels: 1500, net: 2100.1 },
  { id: "2", name: "Mei Ling", outlet: "SGR350", parcels: 980, net: 1450.2 },
  { id: "3", name: "Raju", outlet: "KUL4602", parcels: 1500, net: 2000.3 },
];
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

describe("table logic", () => {
  it("filters case-insensitively on the given keys only", () => {
    expect(filterRows(rows, "kul", ["outlet"]).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterRows(rows, "  MEI ", ["name"]).map((r) => r.id)).toEqual(["2"]);
    expect(filterRows(rows, "kul", ["name"])).toEqual([]);
    expect(filterRows(rows, "", ["name"])).toBe(rows);
  });

  it("sorts numbers numerically and keeps ties in their original order", () => {
    expect(sortRows(rows, { key: "parcels", direction: "asc" }, collator).map((r) => r.id)).toEqual(["2", "1", "3"]);
    expect(sortRows(rows, { key: "parcels", direction: "desc" }, collator).map((r) => r.id)).toEqual(["1", "3", "2"]);
    expect(sortRows(rows, { key: "name", direction: "desc" }, collator).map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(sortRows(rows, null, collator)).toBe(rows);
  });

  it("cycles a column asc then desc, and starts asc on a new column", () => {
    expect(nextSort(null, "net")).toEqual({ key: "net", direction: "asc" });
    expect(nextSort({ key: "net", direction: "asc" }, "net")).toEqual({ key: "net", direction: "desc" });
    expect(nextSort({ key: "net", direction: "desc" }, "net")).toEqual({ key: "net", direction: "asc" });
    expect(nextSort({ key: "net", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
  });

  it("sums money without float dust", () => {
    expect(sumBy(rows, "net")).toBe(5550.6);
    expect(sumBy([{ a: 0.1 }, { a: 0.2 }], "a")).toBe(0.3);
  });

  it("exports CSV with a BOM, escaped cells and raw numbers", () => {
    const csv = toCsv([{ key: "name", header: "派件员" }, { key: "net", header: "Net, RM" }], [{ name: 'A "B"', net: 12.5 }]);
    expect(csv).toBe('﻿派件员,"Net, RM"\r\n"A ""B""",12.5');
  });

  it("accepts only non-negative amounts with up to 2 decimals", () => {
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount(" 0 ")).toBe(0);
    expect(parseAmount("-1")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});
