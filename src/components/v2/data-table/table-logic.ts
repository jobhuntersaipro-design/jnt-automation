import { escapeCsv } from "@/lib/csv";

export type Cell = string | number;
export type Row = Record<string, Cell>;
export type SortState = { key: string; direction: "asc" | "desc" };

export function filterRows<T extends Row>(rows: T[], query: string, keys: (keyof T)[]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => keys.some((k) => String(row[k]).toLowerCase().includes(q)));
}

/** Stable sort; numbers numerically, text with the UI language's collation. */
export function sortRows<T extends Row>(rows: T[], sort: SortState | null, collator: Intl.Collator): T[] {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row[sort.key];
      const y = b.row[sort.key];
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
      return cmp * dir || a.index - b.index;
    })
    .map(({ row }) => row);
}

export function nextSort(current: SortState | null, key: string): SortState {
  return current?.key === key && current.direction === "asc" ? { key, direction: "desc" } : { key, direction: "asc" };
}

export function sumBy<T extends Row>(rows: T[], key: keyof T): number {
  // Sum in cents so RM totals don't pick up float dust.
  return rows.reduce((total, row) => total + Math.round(Number(row[key]) * 100), 0) / 100;
}

/**
 * CSV of what the table shows: money to 2 decimals, and a totals row (labelled in the first column) when any column
 * totals. Starts with a BOM so Excel opens Chinese headers as UTF-8.
 */
export function toCsv<T extends Row>(columns: { key: keyof T; header: string; format?: string; total?: boolean }[], rows: T[], totalLabel = ""): string {
  const cell = (c: (typeof columns)[number], v: Cell) => escapeCsv(c.format === "money" && typeof v === "number" ? v.toFixed(2) : v);
  const lines = [columns.map((c) => escapeCsv(c.header)), ...rows.map((row) => columns.map((c) => cell(c, row[c.key])))];
  if (columns.some((c) => c.total)) lines.push(columns.map((c, i) => (c.total ? cell(c, sumBy(rows, c.key)) : i === 0 ? escapeCsv(totalLabel) : "")));
  return "﻿" + lines.map((cells) => cells.join(",")).join("\r\n");
}

/** Parses an edited amount: non-negative, at most 2 decimals. null when invalid. */
export function parseAmount(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  return Number(text);
}
