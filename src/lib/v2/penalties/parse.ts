import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";
import type { PenaltyType } from "@/lib/v2/pay/config";
import type { Period } from "@/lib/v2/pay/resolve";
import type { Sheet } from "@/lib/v2/pay/sheet";

// Reads J&T HQ's QC penalty files. Nothing is tied to one outlet or one layout: each sheet's
// type comes from its name, title or headers, and its columns from header words in English,
// Chinese or Malay. The import screen shows what was found and lets the user correct it.
// Pure, so the preview (browser) and the import (server) read a file the same way.

export const FIELDS = ["waybill", "extId", "name", "outlet", "date", "amount", "appeal", "note"] as const;
export type Field = (typeof FIELDS)[number];
export type Columns = Partial<Record<Field, number>>;

/** How to read one sheet. Detected by `planSheet`, then possibly corrected on the import screen. */
export interface SheetPlan {
  sheet: string;
  skip: boolean;
  /** null until someone picks one when it couldn't be told. */
  type: PenaltyType | null;
  /** Index into the sheet's rows; the cases are the rows below it. */
  headerRow: number;
  columns: Columns;
}

export interface PenaltyRow {
  type: PenaltyType;
  /** Unique within the month and type: the same case imported again gets the same key. */
  key: string;
  waybill: string | null;
  extId: string | null;
  name: string | null;
  outlet: string | null;
  /** "2026-10-03" or "2026-10-03T14:22:11", the time as written. */
  occurredAt: string | null;
  amountCents: number | null;
  appeal: string | null;
  note: string | null;
  /** The appeal column says it was accepted. */
  waived: boolean;
  sheet: string;
  /** 1-based, as Excel numbers rows. */
  row: number;
}

const HEADER_SCAN = 20;

// First match wins, so the specific types come before the ones whose words they contain.
const TYPE_WORDS: [PenaltyType, RegExp][] = [
  ["PDNC", /pdnc|fake\s*sign|虚假签收|假签收|冒签/i],
  ["FAKE_POP", /fake\s*pop|invalid\s*problem|problem\s*parcel|问题件/i],
  ["FAKE_ATTEMPT", /fake\s*(delivery\s*)?attempt|false\s*attempt|fake\s*delivery|虚假(派送|派件|投递|尝试)|假派送/i],
  ["INACTIVE", /inactive|no\s*scan|without\s*scan|无扫描|未扫描|不活跃|tiada\s*imbasan|tidak\s*aktif/i],
  ["COD_LATE", /\bcod\b.{0,15}(late|overdue|delay)|(late|overdue|delay).{0,15}\bcod\b|(\bcod\b|代收).{0,8}(逾期|延迟|超时)/i],
  ["COD_ISSUE", /\bcod\b|代收货款|代收款/i],
  ["LOST", /\blost\b|missing\s*parcel|遗失|丢失|丢件|hilang/i],
  ["LATE_ARRIVAL", /late\s*arriv|arriv\w*\s*late|迟到|晚到|lewat\s*(tiba|sampai|hadir)/i],
  ["POD", /\bpod\b|proof\s*of\s*delivery|invalid\s*sign|签收(无效|异常|照片|图片)|无效签收/i],
];

// Checked in this order for each header cell; a cell names one field, each field takes its first cell.
const FIELD_WORDS: [Field, RegExp][] = [
  ["waybill", /waybill|\bawb\b|tracking|运单|单号|\bresi\b|bill\s*code|consignment/i],
  [
    "extId",
    /(dispatcher|courier|rider|staff|employee|emp|driver|kurier)\s*(id|code|no\b|no\.|number)|\bid\s*(dispatcher|courier|rider|staff|kurier|pekerja)|员工(编号|工号|id)|工号|(派件|快递|派送|业务)员?(编号|工号|id|账号|代码)|\bj\s*&?\s*n?\s*t\s*(id|no\b|no\.|code)|^id$/i,
  ],
  ["name", /(dispatcher|courier|rider|staff|employee|driver)\s*name|^(name|nama|dispatcher|courier|rider|driver)$|^nama\b|姓名|名字|(派件|快递|派送|业务)员(姓名|名称|名字)?$/i],
  ["outlet", /outlet|branch|station|\bhub\b|\bdp\b|网点|站点|分部|cawangan/i],
  ["appeal", /appeal|申诉|rayuan|dispute/i],
  ["note", /reason|remark|description|detail|\btype\b|category|原因|备注|说明|类型|类别|catatan|sebab|jenis/i],
  ["date", /date|time|日期|时间|tarikh|masa/i],
  ["amount", /amount|amaun|金额|罚款|扣款|罚金|denda|jumlah|\bfines?\b|^(penalty|deduction)s?\s*(\(?rm\)?|\(?myr\)?)?$|^rm$|\(rm\)/i],
];

const TOTAL = /^(grand\s*)?total|^sum\b|合计|总计|小计|^jumlah/i;
const WAIVED = /approv|accept|success|waive|通过|成功|免责|免除|berjaya|lulus/i;
const NOT_WAIVED = /not\s*approv|unsuccess|reject|fail|denied|declin|pending|progress|不通过|未通过|驳回|失败|拒绝|待|处理中|ditolak|gagal/i;

export function detectType(text: string): PenaltyType | null {
  return TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function matchColumns(cells: string[]): Columns {
  const columns: Columns = {};
  cells.forEach((cell, i) => {
    const field = FIELD_WORDS.find(([f, re]) => columns[f] === undefined && re.test(cell.trim()))?.[0];
    if (field) columns[field] = i;
  });
  return columns;
}

export const hasIdentity = (c: Columns) => c.waybill !== undefined || c.extId !== undefined || c.name !== undefined;

/** Finds the header row, its columns and the sheet's type. A sheet with nothing recognisable starts skipped. */
export function planSheet(sheet: Sheet, fileName = ""): SheetPlan {
  let headerRow = -1;
  let columns: Columns = {};
  for (let i = 0; i < Math.min(sheet.rows.length, HEADER_SCAN); i++) {
    const found = matchColumns(sheet.rows[i]);
    if (Object.keys(found).length >= 2 && hasIdentity(found)) {
      headerRow = i;
      columns = found;
      break;
    }
  }
  if (headerRow < 0) headerRow = sheet.rows.findIndex((r) => r.some(Boolean));
  const title = sheet.rows.slice(0, Math.max(headerRow, 0)).flat().join(" ");
  const headers = (sheet.rows[headerRow] ?? []).join(" ");
  // HQ's inactive report is one sheet per outlet, named by its code, listing people (no waybills).
  const inactive = outletCode(sheet.name) !== null && columns.waybill === undefined && hasIdentity(columns) ? "INACTIVE" : null;
  const type = detectType(`${sheet.name} ${title}`) ?? detectType(headers) ?? inactive ?? detectType(fileName);
  return { sheet: sheet.name, skip: !hasIdentity(columns), type, headerRow, columns };
}

/** An outlet code such as KUL4602 in a sheet name or cell ("KUL4602 - TTDI"). */
export const outletCode = (text: string) => /\b([A-Z]{2,4}\d{2,5})\b/.exec(text.toUpperCase())?.[1] ?? null;

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(y: number, m: number, d: number, hh?: string, mm?: string, ss?: string): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  const day = `${y}-${pad(m)}-${pad(d)}`;
  const timeOk = hh !== undefined && Number(hh) < 24 && Number(mm) < 60 && Number(ss ?? 0) < 60;
  return timeOk ? `${day}T${pad(Number(hh))}:${mm}:${ss ?? "00"}` : day;
}

/** "2026-10-03", "2026/10/03 14:22", "3/10/2026" (day first, as in Malaysia), "2026年10月3日", or an Excel serial. */
export function parseDate(text: string): string | null {
  const t = text.trim();
  const time = String.raw`(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?`;
  let m = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${time}`).exec(t);
  if (m) return isoDate(+m[1], +m[2], +m[3], m[4], m[5], m[6]);
  m = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})${time}`).exec(t);
  if (m) return isoDate(+m[3], +m[2], +m[1], m[4], m[5], m[6]);
  m = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(t);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
    return isoDate(serial.getUTCFullYear(), serial.getUTCMonth() + 1, serial.getUTCDate());
  }
  return null;
}

/** "RM 50.00", "-50", "(1,200.5)" → cents. A penalty is a deduction however the file signs it. */
export function parseMoney(text: string): number | null {
  const m = /^\(?-?(\d+)(?:\.(\d+))?\)?$/.exec(text.replace(/rm|myr|\s|,/gi, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Math.round(Number((m[2] ?? "").padEnd(3, "0").slice(0, 3)) / 10);
}

export const isWaived = (appeal: string | null) => !!appeal && WAIVED.test(appeal) && !NOT_WAIVED.test(appeal);

/** Every case in the planned sheets, with keys that stay the same when the file is imported again. */
export function readPenalties(sheets: Sheet[], plans: SheetPlan[]): PenaltyRow[] {
  const rows: Omit<PenaltyRow, "key">[] = [];
  for (const plan of plans) {
    const sheet = sheets.find((s) => s.name === plan.sheet);
    if (plan.skip || !plan.type || !sheet) continue;
    const header = sheet.rows[plan.headerRow] ?? [];
    const sheetOutlet = outletCode(sheet.name);
    sheet.rows.forEach((cells, i) => {
      if (i <= plan.headerRow) return;
      const cell = (f: Field) => {
        const c = plan.columns[f];
        const text = c === undefined ? "" : (cells[c] ?? "").trim();
        return text && text !== header[c!] ? text : ""; // a header repeated on every printed page
      };
      const waybill = cell("waybill").replace(/\s+/g, "").toUpperCase() || null;
      const extId = cell("extId").toUpperCase() || null;
      const name = cell("name") || null;
      if (!waybill && !extId && (!name || cells.some((c) => TOTAL.test(c)))) return; // blank, or a totals row
      const appeal = cell("appeal") || null;
      const outlet = cell("outlet");
      rows.push({
        type: plan.type!,
        waybill,
        extId,
        name,
        outlet: outletCode(outlet) ?? (outlet.slice(0, 40) || sheetOutlet),
        occurredAt: parseDate(cell("date")),
        amountCents: parseMoney(cell("amount")),
        appeal: appeal?.slice(0, 200) ?? null,
        note: cell("note").slice(0, 300) || null,
        waived: isWaived(appeal),
        sheet: sheet.name,
        row: i + 1,
      });
    });
  }
  // A waybill identifies a case; without one, the person, outlet and day do. Repeats get #2, #3…
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = r.waybill ? `w:${r.waybill}` : `p:${r.outlet ?? ""}:${r.extId ?? normalizeName(r.name ?? "")}:${r.occurredAt?.slice(0, 10) ?? ""}`;
    const n = (seen.get(`${r.type}|${base}`) ?? 0) + 1;
    seen.set(`${r.type}|${base}`, n);
    return { ...r, key: n === 1 ? base : `${base}#${n}` };
  });
}

/** The month most of the cases happened in. */
export function mostCommonPeriod(rows: PenaltyRow[]): Period | null {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (!r.occurredAt) continue;
    const period = Number(r.occurredAt.slice(0, 4) + r.occurredAt.slice(5, 7));
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}
