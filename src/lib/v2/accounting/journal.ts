import { DEDUCTING } from "@/lib/v2/pay/engine";
import type { Kind } from "@/lib/v2/pay/config";
import { periodMonth, periodYear, type Period } from "@/lib/v2/pay/resolve";
import { ADVANCE, type PayLine } from "@/lib/v2/payroll/calc";

// A month's finalised payroll as one balanced journal for the accounting software: pay is a cost (debit),
// penalties, deductions and advances taken back are credits, and what's left is owed to dispatchers (credit).
// One line per branch and account, so each branch's cost can be tracked. Pure.

export const SLOTS = ["PARCEL", "KPI", "FUEL", "SC", "SC_RTN", "ALLOWANCE", "PENALTY", "DEDUCTION", "ADVANCE", "NET"] as const;
export type Slot = (typeof SLOTS)[number];

export interface Account {
  code: string;
  name: string;
}
export type AccountMap = Record<Slot, Account>;

export const EMPTY_ACCOUNTS: AccountMap = Object.fromEntries(SLOTS.map((s) => [s, { code: "", name: "" }])) as AccountMap;

export interface JournalRun {
  branch: string;
  lines: PayLine[][];
}

export interface JournalLine {
  branch: string;
  slot: Slot;
  code: string;
  name: string;
  debitCents: number;
  creditCents: number;
}

const slotOf = (l: PayLine): Slot => (l.ruleId === ADVANCE ? "ADVANCE" : (l.kind as Kind as Slot));

/** One line per branch and slot with an amount, earnings first, the amount owed last. Debits equal credits. */
export function buildJournal(runs: JournalRun[], accounts: AccountMap): JournalLine[] {
  const out: JournalLine[] = [];
  for (const run of [...runs].sort((a, b) => a.branch.localeCompare(b.branch))) {
    const sums = new Map<Slot, number>();
    let net = 0;
    for (const person of run.lines)
      for (const l of person) {
        const slot = slotOf(l);
        sums.set(slot, (sums.get(slot) ?? 0) + l.cents);
        net += DEDUCTING.includes(l.kind) ? -l.cents : l.cents;
      }
    sums.set("NET", net);
    for (const slot of SLOTS) {
      const cents = sums.get(slot) ?? 0;
      if (cents === 0) continue;
      // Earnings are costs; what comes off pay and what's owed are credits. A negative amount flips side.
      const credit = slot === "NET" || slot === "ADVANCE" || DEDUCTING.includes(slot as Kind);
      const debit = credit ? cents < 0 : cents > 0;
      out.push({ branch: run.branch, slot, ...accounts[slot], debitCents: debit ? Math.abs(cents) : 0, creditCents: debit ? 0 : Math.abs(cents) });
    }
  }
  return out;
}

/** Slots used by the journal that have no account code yet. */
export const missingAccounts = (lines: JournalLine[]) => [...new Set(lines.filter((l) => !l.code.trim()).map((l) => l.slot))];

/** The month's last day: payroll for a month is booked at its end. */
export function journalDate(period: Period): { iso: string; dmy: string } {
  const y = periodYear(period);
  const m = periodMonth(period);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { iso: `${y}-${pad(m)}-${pad(d)}`, dmy: `${pad(d)}/${pad(m)}/${y}` };
}

const money = (cents: number) => (cents / 100).toFixed(2);
const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export interface JournalText {
  reference: string;
  /** Line description, e.g. "PHG415 · Rate cards". */
  describe: (l: JournalLine) => string;
}

/** Plain debit/credit journal: what an accountant or any accounting software's column mapping can take. */
export function journalCsv(period: Period, lines: JournalLine[], text: JournalText): string {
  const { iso } = journalDate(period);
  return csv([
    ["Date", "Reference", "Branch", "Account code", "Account name", "Description", "Debit", "Credit"],
    ...lines.map((l) => [iso, text.reference, l.branch, l.code, l.name, text.describe(l), l.debitCents ? money(l.debitCents) : "", l.creditCents ? money(l.creditCents) : ""]),
  ]);
}

/**
 * Xero's manual journal import: one journal per narration, amounts signed (debit +, credit −), tax rate by name,
 * the branch as a tracking option when a tracking category is given.
 */
export function xeroCsv(period: Period, lines: JournalLine[], text: JournalText, opts: { taxRate: string; tracking: string }): string {
  const { dmy } = journalDate(period);
  const tracking = opts.tracking.trim();
  return csv([
    ["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount", "TrackingName1", "TrackingOption1"],
    ...lines.map((l) => [text.reference, dmy, text.describe(l), l.code, opts.taxRate, money(l.debitCents - l.creditCents), tracking, tracking ? l.branch : ""]),
  ]);
}
