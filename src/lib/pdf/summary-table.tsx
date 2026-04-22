import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Shared renderer for "header + dense table + totals" PDF exports used by
 * /api/payroll/upload/[uploadId]/export/pdf,
 * /api/staff/[id]/export/pdf, and
 * /api/overview/export/pdf.
 *
 * The layout intentionally mirrors the CSV shape so PDFs carry the same
 * fields in the same order — no design-system work, just legible data.
 */

export type Alignment = "left" | "right" | "center";

export interface SummaryColumn {
  /** Column header text (rendered in small-caps). */
  label: string;
  /** Flex weight — columns with higher values get wider space. Default 1. */
  flex?: number;
  align?: Alignment;
  /** If true, cells render with `tabular-nums`-style monospace digits. */
  tabular?: boolean;
}

export interface SummaryTableInput {
  title: string;
  subtitle?: string;
  /** Small text row under the subtitle (e.g. "Generated 22 Apr 2026 · 47 dispatchers"). */
  meta?: string[];
  columns: SummaryColumn[];
  /** Each row is an array of already-formatted strings, same length as columns. */
  rows: string[][];
  /** Optional footer row (e.g. TOTAL) — rendered bold with a top border. */
  footer?: string[];
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#191c1d",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#c3c6d6",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#191c1d",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    color: "#424654",
    marginBottom: 6,
  },
  meta: {
    fontSize: 8,
    color: "#424654",
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#424654",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#424654",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingRight: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e7e8e9",
  },
  tableCell: {
    fontSize: 9,
    color: "#191c1d",
    paddingRight: 4,
  },
  tableCellTabular: {
    fontSize: 9,
    fontFamily: "Courier",
    color: "#191c1d",
    paddingRight: 4,
  },
  footerRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#424654",
    marginTop: 2,
  },
  footerCell: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#191c1d",
    paddingRight: 4,
  },
  pageNumber: {
    position: "absolute",
    bottom: 16,
    right: 32,
    fontSize: 8,
    color: "#424654",
  },
});

function cellStyle(col: SummaryColumn, kind: "header" | "body" | "footer") {
  const base =
    kind === "header"
      ? styles.tableHeaderCell
      : kind === "footer"
        ? styles.footerCell
        : col.tabular
          ? styles.tableCellTabular
          : styles.tableCell;
  return {
    ...base,
    flex: col.flex ?? 1,
    textAlign: col.align ?? "left",
  };
}

function SummaryTablePdf({ title, subtitle, meta, columns, rows, footer }: SummaryTableInput) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {meta?.map((line, i) => (
            <Text key={i} style={styles.meta}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.tableHeaderRow} fixed>
          {columns.map((col, i) => (
            <Text key={i} style={cellStyle(col, "header")}>
              {col.label}
            </Text>
          ))}
        </View>

        {rows.map((row, ri) => (
          <View key={ri} style={styles.tableRow} wrap={false}>
            {columns.map((col, ci) => (
              <Text key={ci} style={cellStyle(col, "body")}>
                {row[ci] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        {footer ? (
          <View style={styles.footerRow} wrap={false}>
            {columns.map((col, ci) => (
              <Text key={ci} style={cellStyle(col, "footer")}>
                {footer[ci] ?? ""}
              </Text>
            ))}
          </View>
        ) : null}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

/**
 * Render a summary-table PDF to a Node Buffer suitable for a
 * `new NextResponse(buffer, { headers: { "Content-Type": "application/pdf" } })`.
 */
export async function renderSummaryTablePdf(
  input: SummaryTableInput,
): Promise<Buffer> {
  return renderToBuffer(<SummaryTablePdf {...input} />);
}
