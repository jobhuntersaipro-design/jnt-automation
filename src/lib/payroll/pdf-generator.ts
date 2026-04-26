/**
 * Dispatcher payslip PDF — backed by pdfkit.
 *
 * Replaces the previous @react-pdf/renderer implementation. Same
 * `generatePayslipPdf(input) → Buffer` signature and `GeneratePayslipInput`
 * shape, so the `/api/payroll/upload/[uploadId]/payslips` bulk worker and
 * any ad-hoc single-payslip callers don't need updating.
 *
 * Layout: company header → outer bordered frame containing
 *   EMPLOYEE'S PARTICULARS title row
 *   particulars grid (NAME/IC/POSITION | DATE/SOCSO/INCOME TAX)
 *   ADDITION | DEDUCTION two-column table
 *   TOTAL (left) | NET PAY + REMARKS (right)
 * Followed by PREPARED BY + APPROVED BY signature blocks with optional stamp.
 */
import PDFDocument from "pdfkit";
import { countBonusParcelsPerTier, countParcelsPerTier, formatRate } from "./tier-counter";
import type { TierBreakdown } from "./tier-counter";

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const MID_X = CONTENT_LEFT + CONTENT_WIDTH / 2;

const AMOUNT_COL_W = 80;
const ROW_PAD_X = 6;
const ROW_H = 13;

const BLACK = "#000";

export interface PayslipData {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  dispatcherName: string;
  icNo: string;
  month: number;
  year: number;
  /** Default-tier parcels grouped by weight tier (pre-threshold). */
  tierBreakdowns: TierBreakdown[];
  /** Bonus-tier parcels grouped by weight tier (post-threshold). Empty for non-high-performers. */
  bonusTierBreakdowns: TierBreakdown[];
  petrolSubsidy: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

interface LineItemRow {
  weight: number;
  commission: number;
  isBonusTier?: boolean;
}

interface TierSnapshotRow {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface GeneratePayslipInput {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  dispatcherName: string;
  icNo: string;
  month: number;
  year: number;
  petrolSubsidy: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: LineItemRow[];
  weightTiersSnapshot: TierSnapshotRow[];
  /** Tier snapshot used to price post-threshold parcels. Empty for legacy records. */
  bonusTierSnapshot: TierSnapshotRow[];
}

type Row = { label: string; amount: number };

// ─── Drawing helpers ─────────────────────────────────────────────────
function hline(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number): void {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(1).strokeColor(BLACK).stroke();
}
function vline(doc: PDFKit.PDFDocument, x: number, y1: number, y2: number): void {
  doc.moveTo(x, y1).lineTo(x, y2).lineWidth(1).strokeColor(BLACK).stroke();
}
function rect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.lineWidth(1).strokeColor(BLACK).rect(x, y, w, h).stroke();
}

function buildAdditionRows(data: PayslipData): Row[] {
  const rows: Row[] = [];
  for (const t of data.tierBreakdowns) {
    rows.push({ label: `Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`, amount: t.total });
  }
  for (const t of data.bonusTierBreakdowns) {
    rows.push({ label: `Bonus Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`, amount: t.total });
  }
  if (data.petrolSubsidy > 0) rows.push({ label: "Petrol Subsidy", amount: data.petrolSubsidy });
  if (data.commission > 0) rows.push({ label: "Commission", amount: data.commission });
  return rows;
}

function buildDeductionRows(data: PayslipData): Row[] {
  const rows: Row[] = [];
  if (data.penalty > 0) rows.push({ label: "PENALTY", amount: data.penalty });
  if (data.advance > 0) rows.push({ label: "ADVANCE", amount: data.advance });
  return rows;
}

function drawCompanyHeader(doc: PDFKit.PDFDocument, data: PayslipData, y: number): number {
  const header = data.companyRegistrationNo
    ? `${data.companyName} (${data.companyRegistrationNo})`
    : data.companyName;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(BLACK);
  doc.text(header, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
  y = doc.y + 1;
  if (data.companyAddress) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
    for (const line of data.companyAddress.split("\n")) {
      doc.text(line, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "center" });
      y = doc.y + 1;
    }
  }
  return y + 12;
}

function drawLabelColonValue(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  labelW: number,
  label: string,
  value: string,
): void {
  const colonW = 10;
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  doc.text(label, x, y, { width: labelW, lineBreak: false });
  doc.text(":", x + labelW, y, { width: colonW, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text(value, x + labelW + colonW, y, {
    width: width - labelW - colonW,
    lineBreak: false,
    ellipsis: true,
  });
}

function drawParticulars(
  doc: PDFKit.PDFDocument,
  data: PayslipData,
  yTop: number,
): number {
  const lastDay = new Date(data.year, data.month, 0).getDate();
  const dateStr = `${String(lastDay).padStart(2, "0")}/${String(data.month).padStart(2, "0")}/${data.year}`;

  // Names are rendered uppercase for consistency with the staff payroll
  // table and the employee payslip — the user can type any casing when
  // adding the dispatcher but the printed payslip is always uniform.
  const leftParticulars: [string, string][] = [
    ["NAME", data.dispatcherName.toUpperCase()],
    ["I/C NO", data.icNo],
    ["POSITION", "DESPATCH"],
  ];
  const rightParticulars: [string, string][] = [
    ["DATE", dateStr],
    ["SOCSO NO", ""],
    ["INCOME TAX NO", ""],
  ];

  const boxPadX = ROW_PAD_X;
  const boxPadY = 4;
  const lineH = 12;
  const labelW = 75; // matches original partLabel width
  let y = yTop + boxPadY;
  const halfW = CONTENT_WIDTH / 2;
  for (let i = 0; i < 3; i++) {
    drawLabelColonValue(
      doc,
      CONTENT_LEFT + boxPadX,
      y,
      halfW - boxPadX * 2,
      labelW,
      leftParticulars[i][0],
      leftParticulars[i][1],
    );
    drawLabelColonValue(
      doc,
      MID_X + boxPadX,
      y,
      halfW - boxPadX * 2,
      labelW,
      rightParticulars[i][0],
      rightParticulars[i][1],
    );
    y += lineH;
  }
  return y + boxPadY;
}

function drawColumnHeaders(doc: PDFKit.PDFDocument, y: number): number {
  const headerH = 14;
  const leftAmountX = MID_X - AMOUNT_COL_W;
  const rightAmountX = CONTENT_RIGHT - AMOUNT_COL_W;
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);

  const textY = y + 3;
  doc.text("ADDITION", CONTENT_LEFT + ROW_PAD_X, textY, {
    width: (MID_X - CONTENT_LEFT) - AMOUNT_COL_W - ROW_PAD_X * 2,
    align: "center",
    lineBreak: false,
  });
  doc.text("RM", leftAmountX, textY, { width: AMOUNT_COL_W, align: "center", lineBreak: false });
  doc.text("DEDUCTION", MID_X + ROW_PAD_X, textY, {
    width: (CONTENT_RIGHT - MID_X) - AMOUNT_COL_W - ROW_PAD_X * 2,
    align: "center",
    lineBreak: false,
  });
  doc.text("RM", rightAmountX, textY, { width: AMOUNT_COL_W, align: "center", lineBreak: false });

  const underlineY = textY + 10;
  const rule = (x1: number, x2: number) =>
    doc.moveTo(x1, underlineY).lineTo(x2, underlineY).lineWidth(0.6).strokeColor(BLACK).stroke();
  rule(CONTENT_LEFT + ROW_PAD_X, leftAmountX - ROW_PAD_X);
  rule(leftAmountX, leftAmountX + AMOUNT_COL_W);
  rule(MID_X + ROW_PAD_X, rightAmountX - ROW_PAD_X);
  rule(rightAmountX, rightAmountX + AMOUNT_COL_W);

  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y + headerH);
  return y + headerH;
}

function drawHalfDataRows(
  doc: PDFKit.PDFDocument,
  rows: Row[],
  side: "left" | "right",
  yTop: number,
): number {
  const isLeft = side === "left";
  const labelX = (isLeft ? CONTENT_LEFT : MID_X) + ROW_PAD_X;
  const labelW =
    (isLeft ? MID_X - CONTENT_LEFT : CONTENT_RIGHT - MID_X) - AMOUNT_COL_W - ROW_PAD_X * 2;
  const amountX = (isLeft ? MID_X : CONTENT_RIGHT) - AMOUNT_COL_W;

  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  // Allow each row's height to grow with wrapped labels (pdfkit silently
  // wraps long labels even with `lineBreak: false`). Without measuring
  // the actual rendered height the next row would render on top of the
  // wrapped second line.
  let y = yTop + 2;
  for (const r of rows) {
    const labelHeight = doc.heightOfString(r.label, { width: labelW });
    doc.text(r.label, labelX, y, { width: labelW });
    doc.text(formatRM(r.amount), amountX, y, {
      width: AMOUNT_COL_W - ROW_PAD_X,
      align: "right",
      lineBreak: false,
    });
    y += Math.max(ROW_H, labelHeight);
  }
  return y;
}

function drawBottomBar(
  doc: PDFKit.PDFDocument,
  side: "left" | "right",
  label: string,
  amount: number,
  yTop: number,
): number {
  const isLeft = side === "left";
  const xStart = isLeft ? CONTENT_LEFT : MID_X;
  const xEnd = isLeft ? MID_X : CONTENT_RIGHT;
  const labelX = xStart + ROW_PAD_X;
  const labelW = (xEnd - xStart) - AMOUNT_COL_W - ROW_PAD_X * 2;
  const amountX = xEnd - AMOUNT_COL_W;

  hline(doc, xStart, xEnd, yTop);
  const y = yTop + 3;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text(label, labelX, y, { width: labelW, align: "center", lineBreak: false });
  doc.text(formatRM(amount), amountX, y, {
    width: AMOUNT_COL_W - ROW_PAD_X,
    align: "right",
    lineBreak: false,
  });
  return yTop + 16;
}

function drawRemarks(doc: PDFKit.PDFDocument, yTop: number): number {
  hline(doc, MID_X, CONTENT_RIGHT, yTop);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("REMARKS :-", MID_X + ROW_PAD_X, yTop + 4, {
    width: (CONTENT_RIGHT - MID_X) - ROW_PAD_X * 2,
    lineBreak: false,
  });
  return yTop + 28;
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  data: PayslipData,
  yTop: number,
  stampBuffer: Buffer | null,
): void {
  // Place footer immediately under the table — short payslips no longer
  // leave a big blank gap before the signatures, saving paper. Previously
  // the footerY was clamped to PAGE_HEIGHT - MARGIN - 100 which always
  // pushed signatures near the bottom of the page.
  const footerY = yTop + 16;
  const blockW = 180;
  const leftX = CONTENT_LEFT;
  const rightX = CONTENT_RIGHT - blockW;
  const dots = ".......................";

  // Reserve 70px of vertical space for the stamp only when one is
  // provided — without a stamp, the signatures collapse upward.
  const stampHeight = stampBuffer ? 70 : 0;

  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  doc.text(dots, leftX, footerY + stampHeight, { width: blockW, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("PREPARED BY", leftX, footerY + stampHeight + 12, { width: blockW, align: "center", lineBreak: false });

  if (stampBuffer) {
    try {
      doc.image(stampBuffer, rightX + (blockW - 70) / 2, footerY, {
        width: 70,
        height: 70,
        fit: [70, 70],
      });
    } catch {
      // swallow — payslip still renders without stamp
    }
  }
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  doc.text(dots, rightX, footerY + stampHeight, { width: blockW, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("APPROVED BY", rightX, footerY + stampHeight + 12, { width: blockW, align: "center", lineBreak: false });
}

/**
 * Fetch / decode the stamp URL into a Buffer pdfkit's `image()` can
 * consume. HTTPS URLs are common in prod (R2 public URL on the agent
 * record) and pdfkit can't load them inline; we have to materialize the
 * bytes first. Failures are non-fatal — the payslip just renders without
 * the stamp.
 */
async function resolveStampBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      if (comma === -1) return null;
      return Buffer.from(url.slice(comma + 1), "base64");
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    }
    if (/^\/|^[a-zA-Z]:\\/.test(url)) {
      const { readFile } = await import("node:fs/promises");
      return await readFile(url);
    }
  } catch {
    // fall through
  }
  return null;
}

function buildDocument(
  doc: PDFKit.PDFDocument,
  data: PayslipData,
  stampBuffer: Buffer | null,
): void {
  let y = drawCompanyHeader(doc, data, MARGIN);

  const boxTop = y;

  // Title row
  const titleH = 16;
  doc.font("Helvetica").fontSize(9.5).fillColor(BLACK);
  doc.text("EMPLOYEE'S PARTICULARS", CONTENT_LEFT, y + 4, {
    width: CONTENT_WIDTH,
    align: "center",
    lineBreak: false,
  });
  y += titleH;
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y);

  const particularsTop = y;
  y = drawParticulars(doc, data, y);
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y);

  y = drawColumnHeaders(doc, y);
  const bodyTop = y;

  const additionRows = buildAdditionRows(data);
  const deductionRows = buildDeductionRows(data);
  const addTotal =
    data.tierBreakdowns.reduce((s, t) => s + t.total, 0) +
    data.bonusTierBreakdowns.reduce((s, t) => s + t.total, 0) +
    data.petrolSubsidy +
    data.commission;

  // Draw data rows on each side
  const leftDataBottom = drawHalfDataRows(doc, additionRows, "left", bodyTop);
  const rightDataBottom = drawHalfDataRows(doc, deductionRows, "right", bodyTop);

  // Compute where TOTAL (left) and NET PAY (right) go. Pin to the maximum
  // content height so both columns share a consistent section bottom. Right
  // side additionally hosts a REMARKS row below NET PAY.
  const MIN_BODY_H = 140;
  const leftNeed = leftDataBottom - bodyTop + 16; // + TOTAL row
  const rightNeed = rightDataBottom - bodyTop + 16 + 28; // + NET PAY + REMARKS
  const sectionH = Math.max(MIN_BODY_H, leftNeed, rightNeed);
  const sectionBottom = bodyTop + sectionH;

  // Left: TOTAL pinned at bottom
  drawBottomBar(doc, "left", "TOTAL :-", addTotal, sectionBottom - 16);
  // Right: NET PAY pinned above REMARKS (REMARKS = 28 tall)
  drawBottomBar(doc, "right", "NET PAY :-", data.netSalary, sectionBottom - 16 - 28);
  drawRemarks(doc, sectionBottom - 28);

  const boxBottom = sectionBottom;

  // Outer frame + vertical separator
  rect(doc, CONTENT_LEFT, boxTop, CONTENT_WIDTH, boxBottom - boxTop);
  vline(doc, MID_X, particularsTop, boxBottom);

  drawFooter(doc, data, boxBottom, stampBuffer);
}

export async function generatePayslipPdf(input: GeneratePayslipInput): Promise<Buffer> {
  const tierBreakdowns = countParcelsPerTier(input.lineItems, input.weightTiersSnapshot);
  const bonusTierBreakdowns = countBonusParcelsPerTier(
    input.lineItems,
    input.bonusTierSnapshot,
  );

  const data: PayslipData = {
    companyName: input.companyName,
    companyRegistrationNo: input.companyRegistrationNo,
    companyAddress: input.companyAddress,
    stampImageUrl: input.stampImageUrl,
    dispatcherName: input.dispatcherName,
    icNo: input.icNo,
    month: input.month,
    year: input.year,
    tierBreakdowns,
    bonusTierBreakdowns,
    petrolSubsidy: input.petrolSubsidy,
    commission: input.commission,
    penalty: input.penalty,
    advance: input.advance,
    netSalary: input.netSalary,
  };

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Payslip — ${input.dispatcherName} ${input.month}/${input.year}`,
      Author: "EasyStaff",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Pre-fetch the stamp before drawing — pdfkit's `image()` is sync and
  // can't accept remote URLs. Stamp on the agent record is an R2 https
  // URL, so without this round-trip the stamp would silently no-op.
  const stampBuffer = await resolveStampBuffer(input.stampImageUrl);

  buildDocument(doc, data, stampBuffer);
  doc.end();
  return done;
}
