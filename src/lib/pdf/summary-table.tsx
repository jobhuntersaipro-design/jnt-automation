/**
 * Shared renderer for "header + dense table + totals" PDF exports used by
 *   /api/payroll/upload/[uploadId]/export/pdf,
 *   /api/staff/[id]/export/pdf, and
 *   /api/overview/export/pdf.
 *
 * Backed by pdfkit (imperative). Replaces a previous @react-pdf/renderer
 * version; same `renderSummaryTablePdf(input) → Buffer` signature so the
 * three callers don't know the difference.
 */
import PDFDocument from "pdfkit";

export type Alignment = "left" | "right" | "center";

export interface SummaryColumn {
  /** Column header text (rendered in small-caps). */
  label: string;
  /** Flex weight — columns with higher values get wider space. Default 1. */
  flex?: number;
  align?: Alignment;
  /** If true, cells render in Courier (monospace) for tabular digit alignment. */
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

// Landscape A4 at 72 dpi = 841.89 × 595.28 pt. Round to ints for layout.
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const HEADER_ROW_HEIGHT = 14;
const BODY_ROW_HEIGHT = 14;
const FOOTER_ROW_HEIGHT = 16;
const BOTTOM_LIMIT = PAGE_HEIGHT - PAGE_MARGIN - 18; // leave room for page-number strip

const C_TEXT = "#191c1d";
const C_MUTED = "#424654";
const C_RULE = "#424654";
const C_ROW_RULE = "#e7e8e9";
const C_HEADER_RULE = "#c3c6d6";

interface LaidOutColumn extends SummaryColumn {
  x: number;
  w: number;
}

function layoutColumns(columns: SummaryColumn[]): LaidOutColumn[] {
  const totalFlex = columns.reduce((sum, c) => sum + (c.flex ?? 1), 0);
  let x = PAGE_MARGIN;
  return columns.map((c) => {
    const w = Math.floor((CONTENT_WIDTH * (c.flex ?? 1)) / totalFlex);
    const laid: LaidOutColumn = { ...c, x, w };
    x += w;
    return laid;
  });
}

function drawPageTitle(doc: PDFKit.PDFDocument, input: SummaryTableInput): number {
  let y = PAGE_MARGIN;

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C_TEXT);
  doc.text(input.title, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
  y = doc.y + 2;

  if (input.subtitle) {
    doc.font("Helvetica").fontSize(11).fillColor(C_MUTED);
    doc.text(input.subtitle, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y + 2;
  }

  if (input.meta && input.meta.length > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(C_MUTED);
    for (const line of input.meta) {
      doc.text(line, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
      y = doc.y;
    }
  }

  y += 6;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .lineWidth(1)
    .strokeColor(C_HEADER_RULE)
    .stroke();
  return y + 6;
}

function drawHeaderRow(
  doc: PDFKit.PDFDocument,
  columns: LaidOutColumn[],
  y: number,
): number {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(C_MUTED);
  for (const col of columns) {
    doc.text(col.label.toUpperCase(), col.x, y, {
      width: col.w - 4,
      align: col.align ?? "left",
      characterSpacing: 0.6,
    });
  }
  const bottom = y + HEADER_ROW_HEIGHT - 3;
  doc
    .moveTo(PAGE_MARGIN, bottom)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, bottom)
    .lineWidth(1)
    .strokeColor(C_RULE)
    .stroke();
  return bottom + 3;
}

function drawBodyRow(
  doc: PDFKit.PDFDocument,
  columns: LaidOutColumn[],
  values: string[],
  y: number,
): number {
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    doc
      .font(col.tabular ? "Courier" : "Helvetica")
      .fontSize(9)
      .fillColor(C_TEXT);
    doc.text(values[i] ?? "", col.x, y, {
      width: col.w - 4,
      align: col.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
  }
  const bottom = y + BODY_ROW_HEIGHT - 3;
  doc
    .moveTo(PAGE_MARGIN, bottom)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, bottom)
    .lineWidth(0.5)
    .strokeColor(C_ROW_RULE)
    .stroke();
  return bottom + 2;
}

function drawFooterRow(
  doc: PDFKit.PDFDocument,
  columns: LaidOutColumn[],
  values: string[],
  y: number,
): number {
  doc
    .moveTo(PAGE_MARGIN, y - 2)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 2)
    .lineWidth(1)
    .strokeColor(C_RULE)
    .stroke();

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    doc
      .font(col.tabular ? "Courier-Bold" : "Helvetica-Bold")
      .fontSize(9)
      .fillColor(C_TEXT);
    doc.text(values[i] ?? "", col.x, y + 3, {
      width: col.w - 4,
      align: col.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
  }
  return y + FOOTER_ROW_HEIGHT;
}

function drawPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor(C_MUTED);
    doc.text(
      `${i - range.start + 1} / ${range.count}`,
      PAGE_MARGIN,
      PAGE_HEIGHT - PAGE_MARGIN - 8,
      { width: CONTENT_WIDTH, align: "right", lineBreak: false },
    );
  }
}

function buildDocument(
  doc: PDFKit.PDFDocument,
  input: SummaryTableInput,
): void {
  const columns = layoutColumns(input.columns);
  let y = drawPageTitle(doc, input);
  y = drawHeaderRow(doc, columns, y);

  for (const row of input.rows) {
    if (y + BODY_ROW_HEIGHT > BOTTOM_LIMIT) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawHeaderRow(doc, columns, y);
    }
    y = drawBodyRow(doc, columns, row, y);
  }

  if (input.footer) {
    if (y + FOOTER_ROW_HEIGHT > BOTTOM_LIMIT) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = drawHeaderRow(doc, columns, y);
    }
    y = drawFooterRow(doc, columns, input.footer, y);
  }

  drawPageNumbers(doc);
}

/**
 * Render a summary-table PDF to a Node Buffer. Same signature as the previous
 * @react-pdf/renderer implementation — callers unchanged.
 */
export async function renderSummaryTablePdf(
  input: SummaryTableInput,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: input.title,
      Author: "EasyStaff",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  buildDocument(doc, input);
  doc.end();
  return done;
}
