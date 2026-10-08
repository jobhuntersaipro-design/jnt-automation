import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";
import { KINDS, type Kind } from "@/lib/v2/pay/config";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { matchColumns, parseMoney } from "@/lib/v2/penalties/parse";

// Reconciliation: a month's pay in EasyStaff against the account's own payroll sheet, dispatcher
// by dispatcher and figure by figure (net pay, earnings, deductions, parcels, or one kind of pay).
// Pure, so the screen and the server compare the same way.

export const MEASURES = ["net", "earnings", "deductions", "parcels", ...KINDS.map((k) => `kind:${k}` as const)] as const;
export type Measure = (typeof MEASURES)[number];

/** Which sheet columns hold the person and which figures. */
export interface CheckPlan {
  sheet: string;
  headerRow: number;
  extId?: number;
  name?: number;
  measures: { measure: Measure; column: number }[];
}

export interface SheetPerson {
  key: string;
  extId: string | null;
  name: string | null;
  values: Partial<Record<Measure, number>>;
  /** 1-based sheet row. */
  row: number;
}

/** One dispatcher's figures in EasyStaff: cents for money, a count for parcels. */
export interface AppPerson {
  dispatcherId: string;
  extId: string;
  name: string;
  values: Record<Measure, number>;
}

export type CheckStatus = "match" | "differs" | "sheetOnly" | "appOnly";

export interface CheckLine {
  /** Person key and measure: notes are kept against it. */
  key: string;
  person: string;
  extId: string | null;
  name: string | null;
  measure: Measure;
  sheet: number | null;
  app: number | null;
  status: CheckStatus;
}

// Header words for the figures a payroll sheet usually has (English, Chinese, Malay).
const MEASURE_WORDS: [Measure, RegExp][] = [
  ["net", /\bnet+\b|net\s*pay|take\s*home|实发|实付|净|gaji\s*bersih/i],
  ["earnings", /gross|total\s*earn|总收入|应发|gaji\s*kasar/i],
  ["deductions", /total\s*deduct|总扣|jumlah\s*potongan/i],
  ["parcels", /parcel|qty|quantity|件数|派件|order|bungkusan/i],
  ["kind:KPI", /\bkpi\b/i],
  ["kind:FUEL", /fuel|petrol|油/i],
  ["kind:SC_RTN", /sc[\s_-]*rtn|sc\s*return/i],
  ["kind:SC", /\bsc\b/i],
  ["kind:PENALTY", /penalt|fine|罚/i],
  ["kind:ALLOWANCE", /allowance|津贴|elaun/i],
  ["kind:DEDUCTION", /deduct|advance|扣款|预支|potongan|pendahuluan/i],
  ["kind:PARCEL", /commission|rate\s*card|delivery\s*pay|派送费|派件费|运费|komisen/i],
];

const isMoney = (m: Measure) => m !== "parcels";

/** Guesses the header row and columns: the person's ID and name, then any figures it recognises. */
export function planCheck(sheet: Sheet): CheckPlan {
  for (let i = 0; i < Math.min(sheet.rows.length, 20); i++) {
    const cells = sheet.rows[i];
    const who = matchColumns(cells);
    if (who.extId === undefined && who.name === undefined) continue;
    const taken = new Set([who.extId, who.name]);
    const measures: CheckPlan["measures"] = [];
    cells.forEach((cell, column) => {
      if (taken.has(column)) return;
      const measure = MEASURE_WORDS.find(([m, re]) => re.test(cell) && !measures.some((x) => x.measure === m))?.[0];
      if (measure) measures.push({ measure, column });
    });
    if (measures.length > 0) return { sheet: sheet.name, headerRow: i, extId: who.extId, name: who.name, measures };
  }
  return { sheet: sheet.name, headerRow: Math.max(0, sheet.rows.findIndex((r) => r.some(Boolean))), measures: [] };
}

/** The sheet's people and their figures. Rows without an ID or name (titles, totals) are skipped. */
export function readSheetPeople(sheet: Sheet, plan: CheckPlan): SheetPerson[] {
  const people: SheetPerson[] = [];
  const seen = new Map<string, number>();
  sheet.rows.forEach((cells, i) => {
    if (i <= plan.headerRow) return;
    const extId = plan.extId === undefined ? null : (cells[plan.extId] ?? "").trim().toUpperCase() || null;
    const name = plan.name === undefined ? null : (cells[plan.name] ?? "").trim() || null;
    if (!extId && (!name || /^(grand\s*)?total|合计|总计|jumlah/i.test(name))) return;
    const values: SheetPerson["values"] = {};
    for (const { measure, column } of plan.measures) {
      // A blank figure is nothing paid; text that isn't a number is left unread (and shows as a difference).
      const text = (cells[column] ?? "").trim().replace(/^-$/, "");
      const value = !text ? 0 : isMoney(measure) ? parseSignedCents(text) : /^\d+$/.test(text.replace(/,/g, "")) ? Number(text.replace(/,/g, "")) : null;
      if (value !== null) values[measure] = value;
    }
    const base = extId ? `id:${extId}` : `name:${normalizeName(name ?? "")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    people.push({ key: n === 1 ? base : `${base}#${n}`, extId, name, values, row: i + 1 });
  });
  return people;
}

/** Money with its sign kept: net pay can be negative. */
function parseSignedCents(text: string): number | null {
  const cents = parseMoney(text);
  if (cents === null) return null;
  return /^\s*(-|\(|rm\s*-)/i.test(text) ? -cents : cents;
}

/** Every compared figure, person by person: matched by J&T ID, else by a name only one dispatcher has. */
export function compareCheck(sheet: SheetPerson[], app: AppPerson[], measures: Measure[]): CheckLine[] {
  const byId = new Map(app.map((p) => [p.extId.toUpperCase(), p]));
  const byName = new Map<string, AppPerson[]>();
  for (const p of app) byName.set(normalizeName(p.name), [...(byName.get(normalizeName(p.name)) ?? []), p]);
  const used = new Set<string>();
  const lines: CheckLine[] = [];

  for (const s of sheet) {
    const named = s.name ? byName.get(normalizeName(s.name)) : undefined;
    const match = (s.extId ? byId.get(s.extId) : undefined) ?? (named?.length === 1 ? named[0] : undefined);
    const usable = match && !used.has(match.dispatcherId) ? match : undefined;
    if (usable) used.add(usable.dispatcherId);
    for (const measure of measures) {
      const sheetValue = s.values[measure] ?? null;
      const appValue = usable ? usable.values[measure] : null;
      const status: CheckStatus = !usable ? "sheetOnly" : sheetValue !== null && sheetValue === appValue ? "match" : "differs";
      lines.push({ key: `${s.key}|${measure}`, person: s.key, extId: s.extId ?? usable?.extId ?? null, name: s.name ?? usable?.name ?? null, measure, sheet: sheetValue, app: appValue, status });
    }
  }
  for (const p of app) {
    if (used.has(p.dispatcherId)) continue;
    for (const measure of measures) {
      lines.push({ key: `app:${p.dispatcherId}|${measure}`, person: `app:${p.dispatcherId}`, extId: p.extId, name: p.name, measure, sheet: null, app: p.values[measure], status: "appOnly" });
    }
  }
  return lines;
}

/** A dispatcher's figures from their pay lines: cents, and their parcel count. */
export function appValues(result: { netCents: number; earningsCents: number; deductionCents: number; parcels: number; lines: { kind: Kind; cents: number }[] }): Record<Measure, number> {
  const values = { net: result.netCents, earnings: result.earningsCents, deductions: result.deductionCents, parcels: result.parcels } as Record<Measure, number>;
  for (const kind of KINDS) values[`kind:${kind}`] = result.lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.cents, 0);
  return values;
}
