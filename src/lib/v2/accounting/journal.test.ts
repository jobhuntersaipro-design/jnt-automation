import { describe, expect, it } from "vitest";
import type { PayLine } from "@/lib/v2/payroll/calc";
import { buildJournal, EMPTY_ACCOUNTS, journalCsv, journalDate, missingAccounts, xeroCsv, type AccountMap } from "./journal";

const line = (kind: PayLine["kind"], cents: number, ruleId = "r"): PayLine => ({ kind, ruleId, versionId: "v", name: kind, units: 1, groups: [], cents });
const accounts: AccountMap = { ...EMPTY_ACCOUNTS, PARCEL: { code: "6100", name: "Commission" }, PENALTY: { code: "4900", name: "Penalties" }, ADVANCE: { code: "1300", name: "Advances" }, NET: { code: "2200", name: "Wages payable" } };
const text = { reference: "Payroll 2026-11", describe: (l: { branch: string; slot: string }) => `${l.branch} · ${l.slot}` };

describe("buildJournal", () => {
  const runs = [
    { branch: "PHG415", lines: [[line("PARCEL", 100000), line("PENALTY", 5000), line("DEDUCTION", 20000, "advance")], [line("PARCEL", 50000)]] },
    { branch: "KUL4602", lines: [[line("PARCEL", 30000)]] },
  ];
  const j = buildJournal(runs, accounts);

  it("balances, per branch, with pay as debits and what comes off or is owed as credits", () => {
    expect(j.reduce((n, l) => n + l.debitCents, 0)).toBe(j.reduce((n, l) => n + l.creditCents, 0));
    expect(j.map((l) => [l.branch, l.slot, l.debitCents, l.creditCents])).toEqual([
      ["KUL4602", "PARCEL", 30000, 0],
      ["KUL4602", "NET", 0, 30000],
      ["PHG415", "PARCEL", 150000, 0],
      ["PHG415", "PENALTY", 0, 5000],
      ["PHG415", "ADVANCE", 0, 20000],
      ["PHG415", "NET", 0, 125000],
    ]);
  });

  it("lists slots without an account code", () => {
    expect(missingAccounts(buildJournal([{ branch: "A", lines: [[line("KPI", 100)]] }], accounts))).toEqual(["KPI"]);
  });

  it("puts a negative amount owed on the debit side", () => {
    const k = buildJournal([{ branch: "A", lines: [[line("PARCEL", 100), line("PENALTY", 300)]] }], accounts);
    expect(k.find((l) => l.slot === "NET")).toMatchObject({ debitCents: 200, creditCents: 0 });
  });

  it("writes Xero's signed amounts and the plain debit/credit CSV", () => {
    expect(journalDate(202602)).toEqual({ iso: "2026-02-28", dmy: "28/02/2026" });
    const x = xeroCsv(202611, j, text, { taxRate: "No Tax", tracking: "Branch" }).split("\r\n");
    expect(x[0]).toBe("﻿*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount,TrackingName1,TrackingOption1");
    expect(x[1]).toBe("Payroll 2026-11,30/11/2026,KUL4602 · PARCEL,6100,No Tax,300.00,Branch,KUL4602");
    expect(x[2]).toBe("Payroll 2026-11,30/11/2026,KUL4602 · NET,2200,No Tax,-300.00,Branch,KUL4602");
    const c = journalCsv(202611, j, text).split("\r\n");
    expect(c[3]).toBe("2026-11-30,Payroll 2026-11,PHG415,6100,Commission,PHG415 · PARCEL,1500.00,");
  });
});
