import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readXlsx, type Sheet } from "@/lib/v2/pay/sheet";
import { buildDirectory, matchPenalty } from "./match";
import { mostCommonPeriod, parseDate, parseMoney, planSheet, readPenalties, matchColumns } from "./parse";

// Synthetic sheets in the shapes J&T HQ's QC files take: invented people, waybills and amounts.

const fakeAttempt: Sheet = {
  name: "Sheet1",
  rows: [
    ["J&T Express QC Penalty - Fake Delivery Attempt (Oct 2026)"],
    [],
    ["No", "Waybill No", "Dispatcher ID", "Dispatcher Name", "Outlet", "Scan Time", "Penalty (RM)", "Remark"],
    ["1", "JT0001", "kul4602001", "Ahmad Faiz", "KUL4602 - TTDI", "2026-10-03 14:22:11", "50.00", "No call made"],
    ["2", "JT 0002", "KUL4602002", "Siti Aminah", "KUL4602", "3/10/2026", "RM 50", ""],
    ["No", "Waybill No", "Dispatcher ID", "Dispatcher Name", "Outlet", "Scan Time", "Penalty (RM)", "Remark"],
    ["3", "JT0001", "KUL4602001", "Ahmad Faiz", "KUL4602", "2026-10-05", "-50", ""],
    ["", "", "", "Total", "", "", "150.00", ""],
  ],
};

const pdnc: Sheet = {
  name: "虚假签收",
  rows: [
    ["运单号", "派件员编号", "派件员", "网点", "签收时间", "罚款金额", "申诉状态"],
    ["JT1001", "SGR350011", "陈伟明", "SGR350", "2026年10月7日", "100", "申诉成功"],
    ["JT1002", "SGR350011", "陈伟明", "SGR350", "2026-10-08", "100", "申诉失败"],
    ["JT1003", "SGR350012", "林美玲", "SGR350", "2026-10-09", "100", "待审核"],
  ],
};

const inactive = (outlet: string, rows: string[][]): Sheet => ({ name: outlet, rows: [["Courier ID", "Courier Name", "Date", "Fine"], ...rows] });

describe("planSheet", () => {
  it("finds the header under a title, its columns and the type, in English", () => {
    expect(planSheet(fakeAttempt)).toEqual({
      sheet: "Sheet1",
      skip: false,
      type: "FAKE_ATTEMPT",
      headerRow: 2,
      columns: { waybill: 1, extId: 2, name: 3, outlet: 4, date: 5, amount: 6, note: 7 },
    });
  });

  it("reads Chinese headers and takes the type from the sheet name", () => {
    expect(planSheet(pdnc)).toMatchObject({ type: "PDNC", headerRow: 0, columns: { waybill: 0, extId: 1, name: 2, outlet: 3, date: 4, amount: 5, appeal: 6 } });
  });

  it("falls back to the file name, and leaves the type open when nothing says", () => {
    const plain: Sheet = { name: "Sheet1", rows: [["Waybill", "Name", "Amount"], ["JT9", "Ali", "10"]] };
    expect(planSheet(plain).type).toBeNull();
    expect(planSheet(plain, "Lost parcels Oct.xlsx").type).toBe("LOST");
    expect(planSheet(inactive("KUL4602", []), "QC Inactive.xlsx")).toMatchObject({ type: "INACTIVE", skip: false, columns: { extId: 0, name: 1, date: 2, amount: 3 } });
  });

  it("reads a sheet named by an outlet code that lists people, not waybills, as the inactive report", () => {
    expect(planSheet(inactive("SGR7553", [])).type).toBe("INACTIVE");
    expect(planSheet({ name: "SGR7553", rows: [["Waybill", "Name", "Amount"]] }).type).toBeNull();
  });

  it("skips a sheet with no penalty table", () => {
    expect(planSheet({ name: "Notes", rows: [["Prepared by HQ"], ["Contact QC for appeals"]] })).toMatchObject({ skip: true, type: null, headerRow: 0, columns: {} });
  });
});

describe("readPenalties", () => {
  const read = (sheets: Sheet[], fileName = "") => readPenalties(sheets, sheets.map((s) => planSheet(s, fileName)));

  it("reads each case once, skipping repeated headers and totals; a repeated waybill gets its own key", () => {
    const rows = read([fakeAttempt]);
    expect(rows.map((r) => [r.key, r.extId, r.outlet, r.occurredAt, r.amountCents, r.row])).toEqual([
      ["w:JT0001", "KUL4602001", "KUL4602", "2026-10-03T14:22:11", 5000, 4],
      ["w:JT0002", "KUL4602002", "KUL4602", "2026-10-03", 5000, 5],
      ["w:JT0001#2", "KUL4602001", "KUL4602", "2026-10-05", 5000, 7],
    ]);
    expect(rows[0]).toMatchObject({ type: "FAKE_ATTEMPT", name: "Ahmad Faiz", note: "No call made", waived: false, sheet: "Sheet1" });
  });

  it("waives a case only when its appeal was accepted", () => {
    expect(read([pdnc]).map((r) => [r.waybill, r.appeal, r.waived])).toEqual([
      ["JT1001", "申诉成功", true],
      ["JT1002", "申诉失败", false],
      ["JT1003", "待审核", false],
    ]);
  });

  it("keys cases without a waybill by outlet, person and day, with the outlet from the sheet name", () => {
    const sheets = [
      inactive("KUL4602", [["KUL4602001", "Ahmad Faiz", "2026-10-02", "30"], ["KUL4602001", "Ahmad Faiz", "2026-10-02", "30"], ["", "Total", "", "60"]]),
      inactive("SGR350", [["", "Lee Chong", "2026-10-02", "30"]]),
    ];
    const rows = read(sheets, "Inactive Oct.xlsx");
    expect(rows.map((r) => [r.type, r.key, r.outlet])).toEqual([
      ["INACTIVE", "p:KUL4602:KUL4602001:2026-10-02", "KUL4602"],
      ["INACTIVE", "p:KUL4602:KUL4602001:2026-10-02#2", "KUL4602"],
      ["INACTIVE", "p:SGR350:LEE CHONG:2026-10-02", "SGR350"],
    ]);
    expect(read(sheets, "Inactive Oct.xlsx")).toEqual(rows); // the same file again: the same keys
  });

  it("reads nothing from skipped sheets or sheets without a type", () => {
    const plan = { ...planSheet(fakeAttempt), skip: true };
    expect(readPenalties([fakeAttempt], [plan])).toEqual([]);
    expect(readPenalties([fakeAttempt], [{ ...plan, skip: false, type: null }])).toEqual([]);
  });

  it("keeps the time of day from real Excel date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Lost");
    ws.addRow(["Waybill", "Staff ID", "Date", "Amount"]);
    ws.addRow(["JT5", "A1", new Date(Date.UTC(2026, 9, 3, 14, 22, 11)), 120]);
    ws.addRow(["JT6", "A1", new Date(Date.UTC(2026, 9, 4)), 80.5]);
    const sheets = await readXlsx(await wb.xlsx.writeBuffer(), { sheets: 5, rows: 100, cols: 10 });
    expect(read(sheets).map((r) => [r.type, r.occurredAt, r.amountCents])).toEqual([
      ["LOST", "2026-10-03T14:22:11", 12000],
      ["LOST", "2026-10-04", 8050],
    ]);
  });
});

describe("cell values", () => {
  it.each([
    ["2026-10-03", "2026-10-03"],
    ["2026/10/3 9:05", "2026-10-03T09:05:00"],
    ["03.10.2026 25:00", "2026-10-03"],
    ["31/10/2026", "2026-10-31"],
    ["31/02/2026", null],
    ["2026年10月3日 下午", "2026-10-03"],
    ["46298", "2026-10-03"],
    ["soon", null],
  ])("reads the date %s", (text, iso) => expect(parseDate(text)).toBe(iso));

  it.each([
    ["50", 5000],
    ["RM 1,200.50", 120050],
    ["-50.5", 5050],
    ["(30)", 3000],
    ["0.145", 15],
    ["", null],
    ["-", null],
    ["fifty", null],
  ])("reads the amount %s", (text, cents) => expect(parseMoney(text)).toBe(cents));

  it("takes the month most cases happened in", () => {
    const rows = readPenalties([fakeAttempt, pdnc], [planSheet(fakeAttempt), planSheet(pdnc)]);
    expect(mostCommonPeriod(rows)).toBe(202610);
    expect(mostCommonPeriod([])).toBeNull();
  });
});

describe("matchPenalty", () => {
  const dir = buildDirectory(
    [
      { id: "ahmad", name: "Ahmad  Faiz", ids: [{ extId: "KUL4602001", outlet: "KUL4602" }] },
      { id: "ali-kul", name: "Ali", ids: [{ extId: "X9", outlet: "KUL4602" }] },
      { id: "ali-sgr", name: "Ali", ids: [{ extId: "X9", outlet: "SGR350" }] },
    ],
    [
      { key: "id:HUB01", dispatcherId: null },
      { key: "name:SITI AMINAH", dispatcherId: "ahmad" },
    ],
  );

  it("matches by J&T ID, using the outlet when the same ID is at two", () => {
    expect(matchPenalty({ extId: "kul4602001", name: "Someone Else", outlet: null }, dir)).toEqual({ status: "MATCHED", dispatcherId: "ahmad" });
    expect(matchPenalty({ extId: "X9", name: null, outlet: "SGR350" }, dir)).toEqual({ status: "MATCHED", dispatcherId: "ali-sgr" });
    expect(matchPenalty({ extId: "X9", name: null, outlet: null }, dir)).toEqual({ status: "UNMATCHED", dispatcherId: null });
  });

  it("matches a name only one dispatcher has", () => {
    expect(matchPenalty({ extId: null, name: "ahmad faiz", outlet: null }, dir)).toEqual({ status: "MATCHED", dispatcherId: "ahmad" });
    expect(matchPenalty({ extId: null, name: "Ali", outlet: null }, dir)).toEqual({ status: "UNMATCHED", dispatcherId: null });
  });

  it("keeps a name match inside the branch the row names", () => {
    expect(matchPenalty({ extId: null, name: "Ali", outlet: "KUL4602" }, dir)).toEqual({ status: "MATCHED", dispatcherId: "ali-kul" });
    expect(matchPenalty({ extId: null, name: "Ahmad Faiz", outlet: "PHG415" }, dir)).toEqual({ status: "UNMATCHED", dispatcherId: null });
  });

  it("follows earlier decisions first", () => {
    expect(matchPenalty({ extId: "HUB01", name: "Ahmad Faiz", outlet: null }, dir)).toEqual({ status: "IGNORED", dispatcherId: null });
    expect(matchPenalty({ extId: "NEW1", name: "Siti  Aminah", outlet: null }, dir)).toEqual({ status: "MATCHED", dispatcherId: "ahmad" });
  });
});

describe("matchColumns", () => {
  it("reads a J&T ID header as the dispatcher's ID", () => {
    expect(matchColumns(["Waybill", "J&T ID", "Name", "Outlet"]).extId).toBe(1);
    expect(matchColumns(["Waybill", "JNT ID", "Name"]).extId).toBe(1);
  });
});
