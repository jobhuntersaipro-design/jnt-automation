"use client";

import { memo, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { useI18n } from "@/components/v2/i18n-provider";
import type { I18n } from "@/lib/i18n/core";
import { filterRows, nextSort, parseAmount, sortRows, sumBy, toCsv, type Row, type SortState } from "./table-logic";
import styles from "./data-table.module.css";

export interface Column<T extends Row> {
  key: keyof T & string;
  header: string;
  /** money and number cells are right-aligned with tabular figures. */
  format?: "text" | "money" | "number";
  /** Money cells the user can change in place. */
  editable?: boolean;
  /** Show the column's sum in the footer. */
  total?: boolean;
}

interface DataTableProps<T extends Row> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Name used in edit labels, e.g. "Edit Fuel for Ali". */
  rowLabel: (row: T) => string;
  searchKeys: (keyof T & string)[];
  onEdit?: (row: T, key: keyof T & string, value: number) => void;
  exportName: string;
}

/**
 * Payroll-sized table: sort, search, inline money edits, CSV export, totals.
 * No per-row motion, so hundreds of rows stay fast.
 */
// ponytail: renders every row. A sort of 300 rows costs ~8ms in React plus ~70ms of
// browser re-layout (headless, 4 cores); virtualise the rows if an account reaches thousands.
export function DataTable<T extends Row>({ rows, columns, rowKey, rowLabel, searchKeys, onEdit, exportName }: DataTableProps<T>) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const collator = useMemo(() => new Intl.Collator(i18n.tag, { numeric: true, sensitivity: "base" }), [i18n.tag]);

  const visible = useMemo(
    () => sortRows(filterRows(rows, query, searchKeys), sort, collator),
    [rows, query, searchKeys, sort, collator],
  );
  const hasTotals = columns.some((c) => c.total);

  function exportCsv() {
    const blob = new Blob([toCsv(columns, visible)], { type: "text/csv;charset=utf-8" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${exportName}.csv` });
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <SearchField
          className={styles.search}
          label={t("table.search")}
          value={query}
          onValueChange={setQuery}
          clearLabel={t("common.clearSearch")}
        />
        <span className={styles.count} aria-live="polite">
          {tp("table.rows", visible.length)}
        </span>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download size={16} aria-hidden="true" />
          {t("table.export")}
        </Button>
      </div>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sort?.key === col.key ? sort.direction : null;
                const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    data-numeric={col.format && col.format !== "text" ? true : undefined}
                    aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                  >
                    <button type="button" className={styles.sortButton} onClick={() => setSort((s) => nextSort(s, col.key))}>
                      {col.header}
                      <Icon size={14} aria-hidden="true" data-active={active ? true : undefined} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <TableRow key={rowKey(row)} row={row} columns={columns} label={rowLabel(row)} onEdit={onEdit} i18n={i18n} />
            ))}
          </tbody>
          {hasTotals && visible.length > 0 && (
            <tfoot>
              <tr>
                {columns.map((col, index) => (
                  <td key={col.key} data-numeric={col.total ? true : undefined}>
                    {col.total ? formatCell(i18n, col, sumBy(visible, col.key)) : index === 0 ? t("common.total") : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {visible.length === 0 && <p className={styles.empty}>{t("table.empty")}</p>}
      </div>
    </div>
  );
}

function formatCell<T extends Row>(i18n: I18n, col: Column<T>, value: T[keyof T] | number) {
  if (col.format === "money") return i18n.money(Number(value));
  if (col.format === "number") return i18n.number(Number(value));
  return String(value);
}

// Memoised so editing one row re-renders that row only.
const TableRow = memo(function TableRow<T extends Row>({
  row,
  columns,
  label,
  onEdit,
  i18n,
}: {
  row: T;
  columns: Column<T>[];
  label: string;
  onEdit?: (row: T, key: keyof T & string, value: number) => void;
  i18n: I18n;
}) {
  return (
    <tr>
      {columns.map((col, index) => {
        const numeric = col.format && col.format !== "text";
        const Cell = index === 0 ? "th" : "td";
        return (
          <Cell key={col.key} scope={index === 0 ? "row" : undefined} data-numeric={numeric ? true : undefined}>
            {col.editable && onEdit ? (
              <EditableAmount
                value={Number(row[col.key])}
                display={formatCell(i18n, col, row[col.key])}
                label={i18n.t("table.editValue", { column: col.header, name: label })}
                onCommit={(value) => onEdit(row, col.key, value)}
              />
            ) : (
              formatCell(i18n, col, row[col.key])
            )}
          </Cell>
        );
      })}
    </tr>
  );
}) as <T extends Row>(props: {
  row: T;
  columns: Column<T>[];
  label: string;
  onEdit?: (row: T, key: keyof T & string, value: number) => void;
  i18n: I18n;
}) => React.ReactElement;

function EditableAmount({ value, display, label, onCommit }: { value: number; display: string; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseAmount(draft) === null;

  function commit() {
    const parsed = draft === null ? null : parseAmount(draft);
    if (parsed !== null && parsed !== value) onCommit(parsed);
    if (parsed !== null || draft === null) setDraft(null);
  }

  if (draft === null) {
    return (
      <button type="button" className={styles.editable} aria-label={label} onClick={() => setDraft(value.toFixed(2))}>
        {display}
      </button>
    );
  }
  return (
    <input
      className={styles.editInput}
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode="decimal"
      autoFocus
      value={draft}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (invalid ? setDraft(null) : commit())}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}
