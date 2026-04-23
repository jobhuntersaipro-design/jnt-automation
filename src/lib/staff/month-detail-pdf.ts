/**
 * Month-detail PDF generator backed by `pdfkit`.
 *
 * Replaces the previous `@react-pdf/renderer` implementation. The VDOM-based
 * renderer could not handle the ~2500+ parcel months we see for high-performer
 * dispatchers — requests hung for 30–90 s and often OOM'd the function.
 * pdfkit is imperative + 5–10× faster on table-heavy output, and the same
 * `generateMonthDetailPdf(...) → Buffer` signature keeps existing callers
 * (API route + bulk-export worker) unchanged.
 *
 * Post-threshold parcels get a tinted background + "Bonus Tier" tag so the
 * highlight in the on-screen detail page is mirrored in the PDF export.
 */
import PDFDocument from "pdfkit";
import type { TierBreakdown, TierBreakdownRow } from "./month-detail";

interface MonthDetailPdfInput {
  dispatcher: { name: string; extId: string; branchCode: string };
  month: number;
  year: number;
  totals: {
    totalOrders: number;
    totalWeight: number;
    baseSalary: number;
    bonusTierEarnings: number;
    netSalary: number;
  };
  orderThreshold: number;
  tierBreakdown: TierBreakdown;
  lineItems: Array<{
    deliveryDate: Date | null;
    waybillNumber: string;
    weight: number;
    isBonusTier: boolean;
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

// Page geometry (A4, ~595×842 pt at 72dpi)
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = 595 - PAGE_MARGIN * 2;
const ROW_HEIGHT = 12;

// Parcel table columns
const COL = {
  num: { x: PAGE_MARGIN, w: 32, align: "right" as const },
  date: { x: PAGE_MARGIN + 36, w: 70, align: "left" as const },
  awb: { x: PAGE_MARGIN + 110, w: 120, align: "left" as const },
  name: { x: PAGE_MARGIN + 234, w: 170, align: "left" as const },
  tag: { x: PAGE_MARGIN + 408, w: 60, align: "center" as const },
  weight: { x: PAGE_MARGIN + 472, w: 51, align: "right" as const },
};

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000");
  doc.text("#", COL.num.x, y, { width: COL.num.w, align: COL.num.align });
  doc.text("Business Date", COL.date.x, y, { width: COL.date.w, align: COL.date.align });
  doc.text("AWB No.", COL.awb.x, y, { width: COL.awb.w, align: COL.awb.align });
  doc.text("Dispatcher Name", COL.name.x, y, { width: COL.name.w, align: COL.name.align });
  doc.text("Type", COL.tag.x, y, { width: COL.tag.w, align: COL.tag.align });
  doc.text("Weight (kg)", COL.weight.x, y, { width: COL.weight.w, align: COL.weight.align });
  const headerBottom = y + 11;
  doc
    .moveTo(PAGE_MARGIN, headerBottom)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, headerBottom)
    .lineWidth(1)
    .strokeColor("#000")
    .stroke();
  return headerBottom + 3;
}

function drawTierTable(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: TierBreakdownRow[],
  y: number,
  tint?: string,
): number {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(title, PAGE_MARGIN, y);
  y += 14;

  const cols = [
    { label: "Tier", w: 30 },
    { label: "Range", w: 90 },
    { label: "Rate (RM)", w: 60, align: "right" as const },
    { label: "Orders", w: 60, align: "right" as const },
    { label: "Weight (kg)", w: 80, align: "right" as const },
    { label: "Subtotal (RM)", w: CONTENT_WIDTH - 320, align: "right" as const },
  ];

  // Headers
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333");
  let cx = PAGE_MARGIN;
  for (const c of cols) {
    doc.text(c.label.toUpperCase(), cx, y, { width: c.w, align: c.align ?? "left" });
    cx += c.w;
  }
  y += 11;

  for (const row of rows) {
    if (tint) {
      doc
        .rect(PAGE_MARGIN, y - 1, CONTENT_WIDTH, 12)
        .fillOpacity(0.18)
        .fill(tint)
        .fillOpacity(1);
    }
    doc.font("Helvetica").fontSize(9).fillColor("#000");
    cx = PAGE_MARGIN;
    doc.text(`T${row.tier}`, cx, y, { width: cols[0].w });
    cx += cols[0].w;
    doc.text(row.range, cx, y, { width: cols[1].w });
    cx += cols[1].w;
    doc.text(formatRM(row.commission), cx, y, { width: cols[2].w, align: "right" });
    cx += cols[2].w;
    doc.text(row.orderCount.toString(), cx, y, { width: cols[3].w, align: "right" });
    cx += cols[3].w;
    doc.text(row.totalWeight.toFixed(2), cx, y, { width: cols[4].w, align: "right" });
    cx += cols[4].w;
    doc.text(formatRM(row.subtotal), cx, y, { width: cols[5].w, align: "right" });
    y += 12;
  }

  return y + 8;
}

function buildDocument(data: MonthDetailPdfInput, doc: PDFKit.PDFDocument): void {
  const { dispatcher, month, year, totals, tierBreakdown, lineItems, orderThreshold } = data;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  // ── Title + subtitle ───────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000");
  doc.text("Dispatcher Month Detail", PAGE_MARGIN, PAGE_MARGIN, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  doc.font("Helvetica").fontSize(10).fillColor("#444");
  doc.text(
    `${dispatcher.name} · ${dispatcher.extId} · ${dispatcher.branchCode} · ${monthLabel}`,
    PAGE_MARGIN,
    doc.y,
    { width: CONTENT_WIDTH, align: "center" },
  );

  // ── Meta row (4 cells) ─────────────────────────────────────────
  let y = doc.y + 14;
  const cellW = CONTENT_WIDTH / 4;
  const metas: [string, string][] = [
    ["Total Orders", totals.totalOrders.toLocaleString()],
    ["Total Weight (kg)", totals.totalWeight.toFixed(2)],
    ["Base Salary (RM)", formatRM(totals.baseSalary)],
    [
      totals.bonusTierEarnings > 0 ? "Bonus Tier (RM)" : "Net Salary (RM)",
      formatRM(totals.bonusTierEarnings > 0 ? totals.bonusTierEarnings : totals.netSalary),
    ],
  ];
  for (let i = 0; i < metas.length; i++) {
    const x = PAGE_MARGIN + i * cellW;
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(metas[i][0], x, y, { width: cellW });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(metas[i][1], x, y + 12, {
      width: cellW,
    });
  }
  y += 34;

  // ── Tier breakdowns ────────────────────────────────────────────
  y = drawTierTable(doc, "Weight Tier Breakdown", tierBreakdown.base, y);
  if (tierBreakdown.bonusTierEarnings.length > 0) {
    y = drawTierTable(
      doc,
      `Bonus Tier Breakdown — post-threshold (#${(orderThreshold + 1).toLocaleString()}+)`,
      tierBreakdown.bonusTierEarnings,
      y,
      "#10b981", // emerald tint
    );
  }

  // ── Parcel table ───────────────────────────────────────────────
  y += 6;
  y = drawTableHeader(doc, y);

  const bottomLimit = 842 - PAGE_MARGIN - ROW_HEIGHT; // leave room for footer + total
  let rowNum = 0;
  for (const li of lineItems) {
    if (y > bottomLimit) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawTableHeader(doc, y);
    }

    rowNum++;

    // Highlight band for bonusTierEarnings rows
    if (li.isBonusTier) {
      doc
        .rect(PAGE_MARGIN, y - 1.5, CONTENT_WIDTH, ROW_HEIGHT)
        .fillOpacity(0.12)
        .fill("#10b981")
        .fillOpacity(1);
    } else if (rowNum % 2 === 0) {
      doc
        .rect(PAGE_MARGIN, y - 1.5, CONTENT_WIDTH, ROW_HEIGHT)
        .fillOpacity(0.3)
        .fill("#f7f7f7")
        .fillOpacity(1);
    }

    doc.font("Courier").fontSize(8).fillColor("#000");
    doc.text(rowNum.toString(), COL.num.x, y, { width: COL.num.w, align: COL.num.align });
    doc.text(formatDate(li.deliveryDate), COL.date.x, y, { width: COL.date.w, align: COL.date.align });
    doc.text(li.waybillNumber, COL.awb.x, y, { width: COL.awb.w, align: COL.awb.align });
    doc.text(dispatcher.name, COL.name.x, y, {
      width: COL.name.w,
      align: COL.name.align,
      ellipsis: true,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(li.isBonusTier ? "#065f46" : "#777")
      .text(li.isBonusTier ? "BONUS TIER" : "BASE", COL.tag.x, y, {
        width: COL.tag.w,
        align: COL.tag.align,
      });
    doc.font("Courier").fontSize(8).fillColor("#000");
    doc.text(li.weight.toFixed(2), COL.weight.x, y, {
      width: COL.weight.w,
      align: COL.weight.align,
    });

    y += ROW_HEIGHT;
  }

  // ── Grand total ────────────────────────────────────────────────
  if (y > bottomLimit - 4) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .lineWidth(1)
    .strokeColor("#000")
    .stroke();
  y += 4;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
  doc.text("TOTAL", COL.name.x, y, { width: COL.name.w, align: "left" });
  doc.text(
    totals.totalWeight.toFixed(2),
    COL.weight.x,
    y,
    { width: COL.weight.w, align: "right" },
  );

  // ── Running header + page numbers ──────────────────────────────
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor("#666");
    doc.text(`${dispatcher.name} — ${monthLabel}`, PAGE_MARGIN, 16, {
      width: CONTENT_WIDTH,
      align: "left",
    });
    doc.text(
      `Page ${i - pages.start + 1} / ${pages.count}`,
      PAGE_MARGIN,
      16,
      { width: CONTENT_WIDTH, align: "right" },
    );
  }
}

/**
 * Buffer-based entry point. Used by the synchronous API route and the bulk
 * export worker. Accumulates chunks in memory and resolves when pdfkit
 * emits `end`.
 */
export async function generateMonthDetailPdf(
  data: MonthDetailPdfInput,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `Month Detail — ${data.dispatcher.name} ${MONTH_NAMES[data.month - 1]} ${data.year}`,
      Author: "EasyStaff",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  buildDocument(data, doc);
  doc.end();
  return done;
}
