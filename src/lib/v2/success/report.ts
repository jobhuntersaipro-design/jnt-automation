import { z } from "zod";
import type { Sheet } from "@/lib/v2/pay/sheet";

// J&T's monthly success-rate (签收率) report: one row per dispatcher with their J&T ID and either the rate or
// delivered and total parcels. Pure: the columns are guessed from the headers (English, Chinese or Malay), the
// owner can change them, and the same plan reads the rows on import.

export const FIELDS = ["extId", "name", "outlet", "rate", "delivered", "total"] as const;
export type Field = (typeof FIELDS)[number];
export type Columns = Partial<Record<Field, number>>;

export const reportPlan = z.object({
  sheet: z.string().min(1).max(200),
  headerRow: z.number().int().min(0).max(20_000),
  columns: z.object(Object.fromEntries(FIELDS.map((f) => [f, z.number().int().min(0).max(100).optional()])) as Record<Field, z.ZodOptional<z.ZodNumber>>),
});
export type ReportPlan = z.infer<typeof reportPlan>;

const HEADER_SCAN = 20;

// Checked in this order for each header cell; each field takes its first cell. The rate comes before
// delivered, so "签收率" / "success rate" isn't read as a count.
const FIELD_WORDS: [Field, RegExp][] = [
  [
    "extId",
    /(dispatcher|courier|rider|staff|employee|emp|driver|kurier)\s*(id|code|no\b|no\.|number)|\bid\s*(dispatcher|courier|rider|staff|kurier|pekerja)|员工(编号|工号|id)|工号|(派件|快递|派送|业务)员?(编号|工号|id|账号|代码)|\bj\s*&?\s*n?\s*t\s*(id|no\b|no\.|code)|^id$/i,
  ],
  ["name", /(dispatcher|courier|rider|staff|employee|driver)\s*name|^(name|nama|dispatcher|courier|rider|driver)$|^nama\b|姓名|名字|(派件|快递|派送|业务)员(姓名|名称|名字)?$/i],
  ["outlet", /outlet|branch|station|\bhub\b|\bdp\b|网点|站点|分部|cawangan/i],
  ["rate", /success\s*rate|delivery\s*rate|sign(ed)?\s*rate|签收率|妥投率|成功率|派签率|kadar|peratus|^rate$|\(%\)|^%$/i],
  ["delivered", /delivered|signed|successful|签收(量|数|件|票)|妥投(量|数|件|票)|成功(量|数|件|票)|berjaya|dihantar/i],
  ["total", /^total|assigned|dispatched|out\s*for\s*delivery|派件(量|数|件|票)|应签收|总(量|数|件|票)|jumlah|keseluruhan/i],
];

const TOTAL_ROW = /^(grand\s*)?total|^sum\b|合计|总计|小计|^jumlah/i;

export function matchColumns(cells: string[]): Columns {
  const columns: Columns = {};
  cells.forEach((cell, i) => {
    const field = FIELD_WORDS.find(([f, re]) => columns[f] === undefined && re.test(cell.trim()))?.[0];
    if (field !== undefined) columns[field] = i;
  });
  return columns;
}

/** A plan can read rates: a J&T ID and either the rate or delivered and total. */
export const readable = (c: Columns) => c.extId !== undefined && (c.rate !== undefined || (c.delivered !== undefined && c.total !== undefined));

/** The first sheet and header row that look like the report. */
export function planReport(sheets: Sheet[]): ReportPlan | null {
  for (const sheet of sheets) {
    for (let i = 0; i < Math.min(sheet.rows.length, HEADER_SCAN); i++) {
      const columns = matchColumns(sheet.rows[i]);
      if (readable(columns)) return { sheet: sheet.name, headerRow: i, columns };
    }
  }
  return null;
}

const number = (cell: string | undefined): number | null => {
  const text = (cell ?? "").replace(/[,\s%]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
};

export interface ReportRow {
  /** 1-based, as Excel numbers rows. */
  row: number;
  extId: string;
  name: string | null;
  outlet: string | null;
  /** Basis points: 9785 = 97.85%. */
  rateBp: number;
  delivered: number | null;
  total: number | null;
}

/**
 * The report's rows by the plan. A rate column holding only fractions (0.9785) is read as fractions; delivered and
 * total give the rate when there's no rate column. Totals rows, blank IDs and unreadable rates are skipped.
 */
export function readReport(sheet: Sheet, plan: ReportPlan): { rows: ReportRow[]; skipped: number[] } {
  const c = plan.columns;
  const body = sheet.rows.slice(plan.headerRow + 1).map((cells, i) => ({ cells, row: plan.headerRow + i + 2 }));
  const rates = c.rate === undefined ? [] : body.map(({ cells }) => number(cells[c.rate!])).filter((n) => n !== null);
  const fractions = rates.length > 0 && rates.every((n) => n <= 1) && !body.some(({ cells }) => (cells[c.rate!] ?? "").includes("%"));
  const rows: ReportRow[] = [];
  const skipped: number[] = [];
  const seen = new Set<string>();
  for (const { cells, row } of body) {
    if (!cells.some(Boolean)) continue;
    const extId = (cells[c.extId!] ?? "").trim().toUpperCase();
    if (!extId || cells.some((cell) => TOTAL_ROW.test(cell.trim())) || seen.has(extId)) {
      if (extId && !seen.has(extId)) skipped.push(row);
      continue;
    }
    const delivered = c.delivered === undefined ? null : number(cells[c.delivered]);
    const total = c.total === undefined ? null : number(cells[c.total]);
    let rate = c.rate === undefined ? null : number(cells[c.rate]);
    if (rate !== null && fractions) rate *= 100;
    if (rate === null && delivered !== null && total) rate = (delivered / total) * 100;
    if (rate === null || rate < 0 || rate > 100) {
      skipped.push(row);
      continue;
    }
    seen.add(extId);
    const text = (i: number | undefined) => (i === undefined ? null : (cells[i] ?? "").trim() || null);
    rows.push({ row, extId, name: text(c.name), outlet: text(c.outlet)?.toUpperCase() ?? null, rateBp: Math.round(rate * 100), delivered, total });
  }
  return { rows, skipped };
}
