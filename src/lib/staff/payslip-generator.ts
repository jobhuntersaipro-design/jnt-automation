/**
 * Employee payslip PDF — backed by pdfkit.
 *
 * Replaces the previous @react-pdf/renderer implementation. Same
 * `generateEmployeePayslipPdf(input) → Buffer` signature, same
 * EmployeePayslipInput shape, so the four callers
 * (`/api/employee-payroll/.../payslip`, `/api/employee-payroll/.../payslips`,
 * `/api/payroll/upload/.../payslips`, and the bulk worker) don't care.
 *
 * Three templates share the layout — variance is driven off `employeeType`
 * and whether dispatcher tier breakdowns are present:
 *   • Supervisor / Admin  — right particulars: DATE / EPF NO / SOCSO NO
 *   • Store Keeper        — right particulars: DATE / SOCSO NO / INCOME TAX NO;
 *                           addition row shows "WAGES (N HOUR)" instead of BASIC PAY
 *   • Combined (dispatcher + employee) — additions start with per-tier parcel
 *                           rows, then optional bonus tier rows, petrol subsidy,
 *                           commission, then BASIC PAY or WAGES and allowances.
 */
import PDFDocument from "pdfkit";
import {
  countBonusParcelsPerTier,
  countParcelsPerTier,
  formatRate,
} from "../payroll/tier-counter";
import type { TierBreakdown } from "../payroll/tier-counter";

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Layout constants ────────────────────────────────────────────────
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const MID_X = CONTENT_LEFT + CONTENT_WIDTH / 2;

const AMOUNT_COL_W = 80; // width of the right-aligned RM column in each half
const ROW_PAD_X = 6;
const ROW_PAD_Y = 2;
const ROW_H = 13;

const BLACK = "#000";

// ─── Types (unchanged from the React-PDF version) ────────────────────
export interface EmployeePayslipInput {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;

  employeeName: string;
  icNo: string;
  position: string;
  employeeType: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";
  month: number;
  year: number;

  epfNo: string | null;
  socsoNo: string | null;
  incomeTaxNo: string | null;

  basicPay: number;
  workingHours: number;
  hourlyWage: number;
  petrolAllowance: number;
  kpiAllowance: number;
  otherAllowance: number;

  dispatcherTierBreakdowns?: TierBreakdown[];
  dispatcherBonusTierBreakdowns?: TierBreakdown[];
  dispatcherPetrolSubsidy?: number;
  dispatcherCommission?: number;
  dispatcherPenalty?: number;
  dispatcherAdvance?: number;

  epfEmployee: number;
  socsoEmployee: number;
  eisEmployee: number;
  pcb: number;
  penalty: number;
  advance: number;

  epfEmployer: number;
  socsoEmployer: number;
  eisEmployer: number;

  grossSalary: number;
  netSalary: number;
}

const POSITION_LABEL: Record<string, string> = {
  SUPERVISOR: "SUPERVISOR",
  ADMIN: "ADMIN",
  STORE_KEEPER: "STORE KEEPER",
};

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

/**
 * Exported for unit tests. Pure data — no PDF rendering.
 */
export function buildAdditionRows(data: EmployeePayslipInput): Row[] {
  const isCombined = !!data.dispatcherTierBreakdowns;
  const isStoreKeeper = data.employeeType === "STORE_KEEPER";
  const rows: Row[] = [];

  if (isCombined && data.dispatcherTierBreakdowns) {
    for (const t of data.dispatcherTierBreakdowns) {
      rows.push({
        label: `Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`,
        amount: t.total,
      });
    }
    if (data.dispatcherBonusTierBreakdowns) {
      for (const t of data.dispatcherBonusTierBreakdowns) {
        rows.push({
          label: `Bonus Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`,
          amount: t.total,
        });
      }
    }
    if (data.dispatcherPetrolSubsidy && data.dispatcherPetrolSubsidy > 0) {
      rows.push({ label: "Petrol Subsidy", amount: data.dispatcherPetrolSubsidy });
    }
    if (data.dispatcherCommission && data.dispatcherCommission > 0) {
      rows.push({ label: "Commission", amount: data.dispatcherCommission });
    }
  }

  if (isStoreKeeper) {
    rows.push({
      label: `WAGES (${data.workingHours} HOUR)`,
      amount: data.workingHours * data.hourlyWage,
    });
  } else {
    rows.push({ label: "BASIC PAY", amount: data.basicPay });
  }
  if (data.petrolAllowance > 0) rows.push({ label: "PETROL ALLOWANCE", amount: data.petrolAllowance });
  if (data.kpiAllowance > 0) rows.push({ label: "KPI", amount: data.kpiAllowance });
  if (data.otherAllowance > 0) rows.push({ label: "ALLOWANCE", amount: data.otherAllowance });

  return rows;
}

/**
 * Exported for unit tests. Pure data — no PDF rendering.
 *
 * In combined mode (`dispatcherTierBreakdowns` present), `data.penalty` and
 * `data.advance` are the *combined* values stored on EmployeeSalaryRecord
 * (employee manual entry + dispatcher-originated), and `dispatcherPenalty` /
 * `dispatcherAdvance` are the dispatcher portion. To avoid double-counting
 * in the deduction column, we split "Penalty" → employee-only and show
 * "Penalty (Dispatcher)" separately. Sum stays equal to `data.penalty`.
 */
export function buildDeductionRows(data: EmployeePayslipInput): Row[] {
  const isCombined = !!data.dispatcherTierBreakdowns;
  const rows: Row[] = [];
  if (data.epfEmployee > 0) rows.push({ label: "EMPLOYEE EPF (KWSP)", amount: data.epfEmployee });
  if (data.socsoEmployee > 0) rows.push({ label: "EMPLOYEE SOCSO(PERKESO)", amount: data.socsoEmployee });
  if (data.eisEmployee > 0) rows.push({ label: "EMPLOYMENT INSURANCE SCHEME (EIS)", amount: data.eisEmployee });
  if (data.pcb > 0) rows.push({ label: "PCB", amount: data.pcb });

  const dispatcherPenalty = isCombined ? (data.dispatcherPenalty ?? 0) : 0;
  const dispatcherAdvance = isCombined ? (data.dispatcherAdvance ?? 0) : 0;
  const employeePenalty = Math.max(0, data.penalty - dispatcherPenalty);
  const employeeAdvance = Math.max(0, data.advance - dispatcherAdvance);

  if (employeePenalty > 0) rows.push({ label: "Penalty", amount: employeePenalty });
  if (employeeAdvance > 0) rows.push({ label: "Advance", amount: employeeAdvance });
  if (dispatcherPenalty > 0) rows.push({ label: "Penalty (Dispatcher)", amount: dispatcherPenalty });
  if (dispatcherAdvance > 0) rows.push({ label: "Advance (Dispatcher)", amount: dispatcherAdvance });
  return rows;
}

function drawCompanyHeader(doc: PDFKit.PDFDocument, data: EmployeePayslipInput, y: number): number {
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
  label: string,
  value: string,
): void {
  const labelW = 90;
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
  data: EmployeePayslipInput,
  yTop: number,
): number {
  const isStoreKeeper = data.employeeType === "STORE_KEEPER";
  const position = POSITION_LABEL[data.employeeType] ?? data.position;
  const lastDay = new Date(data.year, data.month, 0).getDate();
  const dateStr = `${String(lastDay).padStart(2, "0")}/${String(data.month).padStart(2, "0")}/${data.year}`;

  const rightParticulars = isStoreKeeper
    ? [
        ["DATE", dateStr],
        ["SOCSO NO", data.socsoNo ?? ""],
        ["INCOME TAX NO", data.incomeTaxNo ?? ""],
      ]
    : [
        ["DATE", dateStr],
        ["EPF NO", data.epfNo ?? ""],
        ["SOCSO NO", data.socsoNo ?? ""],
      ];

  const leftParticulars: [string, string][] = [
    ["NAME", data.employeeName],
    ["I/C NO", data.icNo],
    ["POSITION", position],
  ];

  const boxPadX = ROW_PAD_X;
  const boxPadY = 4;
  const lineH = 12;
  let y = yTop + boxPadY;
  const halfW = CONTENT_WIDTH / 2;
  for (let i = 0; i < 3; i++) {
    drawLabelColonValue(doc, CONTENT_LEFT + boxPadX, y, halfW - boxPadX * 2, leftParticulars[i][0], leftParticulars[i][1]);
    drawLabelColonValue(doc, MID_X + boxPadX, y, halfW - boxPadX * 2, rightParticulars[i][0], rightParticulars[i][1] as string);
    y += lineH;
  }
  return y + boxPadY;
}

function drawColumnHeaders(doc: PDFKit.PDFDocument, y: number): number {
  const headerH = 14;
  // ADDITION | RM  (left half)
  const leftAmountX = MID_X - AMOUNT_COL_W;
  const rightAmountX = CONTENT_RIGHT - AMOUNT_COL_W;
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);

  // Underlined headers — pdfkit needs manual underline since text option
  // `underline` varies across builds; draw a thin rule under the label instead.
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

  // Thin rule under each header label (mimics textDecoration: underline)
  const underlineY = textY + 10;
  const rule = (x1: number, x2: number) =>
    doc.moveTo(x1, underlineY).lineTo(x2, underlineY).lineWidth(0.6).strokeColor(BLACK).stroke();
  rule(CONTENT_LEFT + ROW_PAD_X, leftAmountX - ROW_PAD_X);
  rule(leftAmountX, leftAmountX + AMOUNT_COL_W);
  rule(MID_X + ROW_PAD_X, rightAmountX - ROW_PAD_X);
  rule(rightAmountX, rightAmountX + AMOUNT_COL_W);

  // Bottom rule for the header row spans full width.
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y + headerH);
  return y + headerH;
}

function drawTableBody(
  doc: PDFKit.PDFDocument,
  additions: Row[],
  deductions: Row[],
  yTop: number,
): number {
  const leftAmountX = MID_X - AMOUNT_COL_W;
  const rightAmountX = CONTENT_RIGHT - AMOUNT_COL_W;
  const rowCount = Math.max(additions.length, deductions.length, 1);
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);

  for (let i = 0; i < rowCount; i++) {
    const y = yTop + i * ROW_H + ROW_PAD_Y;
    const add = additions[i];
    if (add) {
      doc.text(add.label, CONTENT_LEFT + ROW_PAD_X, y, {
        width: (MID_X - CONTENT_LEFT) - AMOUNT_COL_W - ROW_PAD_X * 2,
        lineBreak: false,
        ellipsis: true,
      });
      doc.text(formatRM(add.amount), leftAmountX, y, {
        width: AMOUNT_COL_W - ROW_PAD_X,
        align: "right",
        lineBreak: false,
      });
    }
    const ded = deductions[i];
    if (ded) {
      doc.text(ded.label, MID_X + ROW_PAD_X, y, {
        width: (CONTENT_RIGHT - MID_X) - AMOUNT_COL_W - ROW_PAD_X * 2,
        lineBreak: false,
        ellipsis: true,
      });
      doc.text(formatRM(ded.amount), rightAmountX, y, {
        width: AMOUNT_COL_W - ROW_PAD_X,
        align: "right",
        lineBreak: false,
      });
    }
  }
  return yTop + rowCount * ROW_H;
}

function drawTotalRow(doc: PDFKit.PDFDocument, gross: number, yTop: number): number {
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, yTop);
  const rowH = 16;
  const y = yTop + 3;
  const leftAmountX = MID_X - AMOUNT_COL_W;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("TOTAL :-", CONTENT_LEFT + ROW_PAD_X, y, {
    width: (MID_X - CONTENT_LEFT) - AMOUNT_COL_W - ROW_PAD_X * 2,
    align: "center",
    lineBreak: false,
  });
  doc.text(formatRM(gross), leftAmountX, y, {
    width: AMOUNT_COL_W - ROW_PAD_X,
    align: "right",
    lineBreak: false,
  });
  return yTop + rowH;
}

function drawEmployerAndNetPay(
  doc: PDFKit.PDFDocument,
  data: EmployeePayslipInput,
  yTop: number,
  displayedNet: number,
): number {
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, yTop);
  const innerPadX = ROW_PAD_X;
  const innerPadY = 6;
  let yLeft = yTop + innerPadY;
  let yRight = yTop + innerPadY;

  // Left: EMPLOYER'S CONTRIBUTION
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("EMPLOYER'S CONTRIBUTION", CONTENT_LEFT + innerPadX, yLeft, {
    width: (MID_X - CONTENT_LEFT) - innerPadX * 2,
    lineBreak: false,
  });
  // Manual underline for the title
  const titleBottom = yLeft + 10;
  doc
    .moveTo(CONTENT_LEFT + innerPadX, titleBottom)
    .lineTo(CONTENT_LEFT + innerPadX + doc.widthOfString("EMPLOYER'S CONTRIBUTION"), titleBottom)
    .lineWidth(0.6)
    .strokeColor(BLACK)
    .stroke();
  yLeft += 16;

  const employerLines: [string, number][] = [
    ["EPF", data.epfEmployer],
    ["SOCSO", data.socsoEmployer],
    ["EIS", data.eisEmployer],
  ];
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  for (const [label, amt] of employerLines) {
    const labelW = 45;
    const colonW = 10;
    const x = CONTENT_LEFT + innerPadX;
    doc.text(label, x, yLeft, { width: labelW, lineBreak: false });
    doc.text(":", x + labelW, yLeft, { width: colonW, lineBreak: false });
    doc.text(`RM${formatRM(amt)}`, x + labelW + colonW, yLeft, {
      width: (MID_X - CONTENT_LEFT) - innerPadX * 2 - labelW - colonW,
      lineBreak: false,
    });
    yLeft += 12;
  }
  yLeft += 6;

  // Right: NET PAY + REMARKS
  const rightX = MID_X + innerPadX;
  const rightW = (CONTENT_RIGHT - MID_X) - innerPadX * 2;
  const rightAmountX = CONTENT_RIGHT - AMOUNT_COL_W;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("NET PAY :-", rightX, yRight, {
    width: rightW - AMOUNT_COL_W,
    align: "center",
    lineBreak: false,
  });
  doc.text(formatRM(displayedNet), rightAmountX, yRight, {
    width: AMOUNT_COL_W - ROW_PAD_X,
    align: "right",
    lineBreak: false,
  });
  yRight += 18;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("REMARKS :-", rightX, yRight, { width: rightW, lineBreak: false });
  yRight += 30; // reserve blank space for remarks

  return Math.max(yLeft, yRight) + innerPadY;
}

function drawFooter(doc: PDFKit.PDFDocument, data: EmployeePayslipInput, yTop: number): void {
  const footerY = Math.max(yTop + 40, PAGE_HEIGHT - MARGIN - 100);
  const blockW = 180;
  const leftX = CONTENT_LEFT;
  const rightX = CONTENT_RIGHT - blockW;
  const dots = "…………………………..";

  // Left — PREPARED BY
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  doc.text(dots, leftX, footerY + 70, { width: blockW, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("PREPARED BY", leftX, footerY + 82, { width: blockW, align: "center", lineBreak: false });

  // Right — optional stamp + APPROVED BY
  if (data.stampImageUrl) {
    try {
      // pdfkit's `image()` accepts a data URL, local path, or Buffer. Remote
      // URLs aren't supported inline — callers pass through an already-fetched
      // buffer encoded as a data URL, or a local file path. If the input is an
      // HTTPS URL we skip silently rather than crashing the whole payslip.
      if (/^data:|^\/|^[a-zA-Z]:\\/.test(data.stampImageUrl)) {
        doc.image(data.stampImageUrl, rightX + (blockW - 70) / 2, footerY, {
          width: 70,
          height: 70,
          fit: [70, 70],
        });
      }
    } catch {
      // swallow — payslip still renders without stamp
    }
  }
  doc.font("Helvetica").fontSize(9).fillColor(BLACK);
  doc.text(dots, rightX, footerY + 70, { width: blockW, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BLACK);
  doc.text("APPROVED BY", rightX, footerY + 82, { width: blockW, align: "center", lineBreak: false });
}

function buildDocument(doc: PDFKit.PDFDocument, data: EmployeePayslipInput): void {
  // Company header
  let y = drawCompanyHeader(doc, data, MARGIN);

  // ── Outer bordered frame begins ──────────────────────────────────
  const boxTop = y;

  // Title row inside box: "EMPLOYEE'S PARTICULARS"
  const titleH = 16;
  doc.font("Helvetica").fontSize(9.5).fillColor(BLACK);
  doc.text("EMPLOYEE'S PARTICULARS", CONTENT_LEFT, y + 4, {
    width: CONTENT_WIDTH,
    align: "center",
    lineBreak: false,
  });
  y += titleH;
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y);

  // Particulars grid
  const particularsTop = y;
  y = drawParticulars(doc, data, y);
  hline(doc, CONTENT_LEFT, CONTENT_RIGHT, y);

  // Column headers (ADDITION | DEDUCTION)
  const tableHeaderTop = y;
  y = drawColumnHeaders(doc, y);

  // Body rows
  const bodyTop = y;
  const additions = buildAdditionRows(data);
  const deductions = buildDeductionRows(data);
  y = drawTableBody(doc, additions, deductions, bodyTop);
  const bodyBottom = y;

  // Internal-consistency invariant: TOTAL == sum(addition rows), NET ==
  // TOTAL - sum(deduction rows). Using `data.grossSalary` directly breaks
  // when the saved EmployeeSalaryRecord is stale — e.g. the combined
  // Admin+dispatcher case where a name-based dispatcher match added rows
  // to the displayed additions after the record had been saved with just
  // the employee's own gross. Compute from the row totals so the payslip
  // is always self-consistent regardless of stored field drift.
  const displayedGross = additions.reduce((s, r) => s + r.amount, 0);
  const displayedDeductions = deductions.reduce((s, r) => s + r.amount, 0);
  const displayedNet = displayedGross - displayedDeductions;

  // TOTAL row
  y = drawTotalRow(doc, displayedGross, bodyBottom);
  const totalBottom = y;

  // Employer contribution + Net Pay (uses displayedNet — consistent with TOTAL)
  y = drawEmployerAndNetPay(doc, data, totalBottom, displayedNet);
  const boxBottom = y;

  // ── Outer frame: draw border rectangle enclosing everything ──────
  rect(doc, CONTENT_LEFT, boxTop, CONTENT_WIDTH, boxBottom - boxTop);
  // Vertical separator through particulars + table body + TOTAL + employer
  vline(doc, MID_X, particularsTop, boxBottom);
  // (Header row cells don't have a vertical separator in the original —
  // the mid line is continuous because the separator runs top-to-bottom.)

  // Footer (stamp + signatures, outside the box)
  drawFooter(doc, data, boxBottom);
  // Silence unused-var warnings for markers we kept for readability
  void tableHeaderTop;
}

export async function generateEmployeePayslipPdf(
  input: EmployeePayslipInput,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `Payslip — ${input.employeeName} ${input.month}/${input.year}`,
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

// Re-export utilities that consumers import alongside the payslip generator.
export { countParcelsPerTier, countBonusParcelsPerTier, formatRate };
export type { TierBreakdown };
