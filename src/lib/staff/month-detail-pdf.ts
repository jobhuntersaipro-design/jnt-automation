import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { TierBreakdownRow } from "./month-detail";

interface MonthDetailPdfInput {
  dispatcher: { name: string; extId: string; branchCode: string };
  month: number;
  year: number;
  totals: {
    totalOrders: number;
    totalWeight: number;
    baseSalary: number;
    netSalary: number;
  };
  tierBreakdown: TierBreakdownRow[];
  lineItems: Array<{
    deliveryDate: Date | null;
    waybillNumber: string;
    weight: number;
  }>;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRM(n: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 32,
    paddingHorizontal: 36,
    fontSize: 8,
    fontFamily: "Courier",
  },

  // Header (first page only)
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  subtitle: { fontSize: 10, fontFamily: "Helvetica", textAlign: "center", color: "#444" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, marginBottom: 8, fontFamily: "Helvetica", fontSize: 9 },
  metaCell: { flex: 1 },
  metaLabel: { color: "#555" },
  metaValue: { fontFamily: "Helvetica-Bold" },

  // Tier breakdown (first page only)
  tierSection: { marginTop: 8, marginBottom: 12 },
  tierTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  tierRow: { flexDirection: "row", paddingVertical: 2, fontFamily: "Helvetica", fontSize: 9, borderTopWidth: 0.5, borderTopColor: "#ccc" },
  tierHeader: { flexDirection: "row", paddingVertical: 2, fontFamily: "Helvetica-Bold", fontSize: 8.5, textTransform: "uppercase", letterSpacing: 0.5 },
  tierTier: { width: 30 },
  tierRange: { width: 90 },
  tierRate: { width: 60, textAlign: "right" },
  tierOrders: { width: 60, textAlign: "right" },
  tierWeight: { width: 80, textAlign: "right" },
  tierSubtotal: { flex: 1, textAlign: "right" },

  // Running header on every page
  runningHeader: {
    position: "absolute",
    top: 16,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#666",
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaa",
  },

  // Table header (repeats per page via `fixed`)
  tableHeader: {
    flexDirection: "row",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    marginBottom: 2,
  },
  // Parcel rows
  row: { flexDirection: "row", paddingVertical: 1.5 },
  rowAlt: { backgroundColor: "#f7f7f7" },
  rowNum: { width: 34, textAlign: "right", paddingRight: 4 },
  rowDate: { width: 80 },
  rowAwb: { width: 130 },
  rowName: { flex: 1 },
  rowWeight: { width: 60, textAlign: "right" },

  // Total row
  totalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#000",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginTop: 4,
  },

  // Footer page number
  pageNumber: {
    position: "absolute",
    bottom: 16,
    left: 36,
    right: 36,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#666",
    textAlign: "right",
  },
});

function MonthDetailDocument({ data }: { data: MonthDetailPdfInput }) {
  const { dispatcher, month, year, totals, tierBreakdown, lineItems } = data;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: s.page },

      // Running header on every page
      React.createElement(
        View,
        { style: s.runningHeader, fixed: true },
        React.createElement(Text, null, `${dispatcher.name} — ${monthLabel}`),
        React.createElement(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} / ${totalPages}`,
        }),
      ),

      // Title + subtitle (first page only)
      React.createElement(Text, { style: s.title }, "Dispatcher Month Detail"),
      React.createElement(
        Text,
        { style: s.subtitle },
        `${dispatcher.name} · ${dispatcher.extId} · ${dispatcher.branchCode} · ${monthLabel}`,
      ),

      // Meta row (totals summary)
      React.createElement(
        View,
        { style: s.metaRow },
        React.createElement(
          View,
          { style: s.metaCell },
          React.createElement(Text, { style: s.metaLabel }, "Total Orders"),
          React.createElement(Text, { style: s.metaValue }, totals.totalOrders.toLocaleString()),
        ),
        React.createElement(
          View,
          { style: s.metaCell },
          React.createElement(Text, { style: s.metaLabel }, "Total Weight (kg)"),
          React.createElement(Text, { style: s.metaValue }, totals.totalWeight.toFixed(2)),
        ),
        React.createElement(
          View,
          { style: s.metaCell },
          React.createElement(Text, { style: s.metaLabel }, "Base Salary (RM)"),
          React.createElement(Text, { style: s.metaValue }, formatRM(totals.baseSalary)),
        ),
        React.createElement(
          View,
          { style: s.metaCell },
          React.createElement(Text, { style: s.metaLabel }, "Net Salary (RM)"),
          React.createElement(Text, { style: s.metaValue }, formatRM(totals.netSalary)),
        ),
      ),

      // Tier breakdown
      React.createElement(
        View,
        { style: s.tierSection },
        React.createElement(Text, { style: s.tierTitle }, "Weight Tier Breakdown"),
        React.createElement(
          View,
          { style: s.tierHeader },
          React.createElement(Text, { style: s.tierTier }, "Tier"),
          React.createElement(Text, { style: s.tierRange }, "Range"),
          React.createElement(Text, { style: s.tierRate }, "Rate (RM)"),
          React.createElement(Text, { style: s.tierOrders }, "Orders"),
          React.createElement(Text, { style: s.tierWeight }, "Weight (kg)"),
          React.createElement(Text, { style: s.tierSubtotal }, "Subtotal (RM)"),
        ),
        ...tierBreakdown.map((t, i) =>
          React.createElement(
            View,
            { key: i, style: s.tierRow },
            React.createElement(Text, { style: s.tierTier }, `T${t.tier}`),
            React.createElement(Text, { style: s.tierRange }, t.range),
            React.createElement(Text, { style: s.tierRate }, formatRM(t.commission)),
            React.createElement(Text, { style: s.tierOrders }, t.orderCount.toString()),
            React.createElement(Text, { style: s.tierWeight }, t.totalWeight.toFixed(2)),
            React.createElement(Text, { style: s.tierSubtotal }, formatRM(t.subtotal)),
          ),
        ),
      ),

      // Parcel table header (repeats on every page via `fixed`)
      React.createElement(
        View,
        { style: s.tableHeader, fixed: true },
        React.createElement(Text, { style: s.rowNum }, "#"),
        React.createElement(Text, { style: s.rowDate }, "Business Date"),
        React.createElement(Text, { style: s.rowAwb }, "AWB No."),
        React.createElement(Text, { style: s.rowName }, "Dispatcher Name"),
        React.createElement(Text, { style: s.rowWeight }, "Weight (kg)"),
      ),

      // Parcel rows
      ...lineItems.map((li, i) =>
        React.createElement(
          View,
          {
            key: i,
            style: [s.row, ...(i % 2 === 1 ? [s.rowAlt] : [])],
            wrap: false,
          },
          React.createElement(Text, { style: s.rowNum }, (i + 1).toString()),
          React.createElement(Text, { style: s.rowDate }, formatDate(li.deliveryDate)),
          React.createElement(Text, { style: s.rowAwb }, li.waybillNumber),
          React.createElement(Text, { style: s.rowName }, dispatcher.name),
          React.createElement(Text, { style: s.rowWeight }, li.weight.toFixed(2)),
        ),
      ),

      // Grand total
      React.createElement(
        View,
        { style: s.totalRow, wrap: false },
        React.createElement(Text, { style: s.rowNum }, ""),
        React.createElement(Text, { style: s.rowDate }, ""),
        React.createElement(Text, { style: s.rowAwb }, ""),
        React.createElement(Text, { style: s.rowName }, "TOTAL"),
        React.createElement(Text, { style: s.rowWeight }, totals.totalWeight.toFixed(2)),
      ),
    ),
  );
}

export async function generateMonthDetailPdf(data: MonthDetailPdfInput): Promise<Buffer> {
  const element = React.createElement(MonthDetailDocument, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await renderToBuffer(element as any);
  return Buffer.from(result);
}
