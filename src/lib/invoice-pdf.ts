import PDFDocument from "pdfkit";
import { INVOICE_DUE_DAYS, invoiceNumber, type YearMonth } from "@/lib/billing";
import { SUPPORT_EMAIL } from "@/lib/support";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PAGE_WIDTH = 595;
const MARGIN = 50;
const RIGHT = PAGE_WIDTH - MARGIN;
const WIDTH = RIGHT - MARGIN;
const BRAND = "#0056D2";
const TEXT = "#191c1d";
const MUTED = "#424654";
const LIGHT = "#f3f4f5";

export interface InvoicePdfInput extends YearMonth {
  agentId: string;
  agentName: string;
  agentEmail: string;
  agentPhone: string | null;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  branchCount: number;
  unitPrice: number;
  amount: number;
  issuedAt: Date;
  paidAt: Date | null;
}

function rm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function day(d: Date): string {
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Bank transfer instructions — set INVOICE_PAYMENT_DETAILS (one line per row). */
export function paymentDetails(): string[] {
  const raw = process.env.INVOICE_PAYMENT_DETAILS?.trim();
  if (raw) return raw.split(/\\n|\n/).map((l) => l.trim()).filter(Boolean);
  return [`Please contact ${SUPPORT_EMAIL} for payment details.`];
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const number = invoiceNumber(input.agentId, input);
  const due = new Date(input.issuedAt);
  due.setDate(due.getDate() + INVOICE_DUE_DAYS);

  // Header
  doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(22).text("EasyStaff", MARGIN, MARGIN);
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(SUPPORT_EMAIL, MARGIN, MARGIN + 28);
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(22).text("INVOICE", MARGIN, MARGIN, { width: WIDTH, align: "right" });

  const meta: [string, string][] = [
    ["Invoice no", number],
    ["Issue date", day(input.issuedAt)],
    ["Due date", day(due)],
    ["Billing period", monthLabel(input)],
  ];
  let y = MARGIN + 34;
  doc.fontSize(9);
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).font("Helvetica").text(label, RIGHT - 220, y, { width: 100 });
    doc.fillColor(TEXT).font("Helvetica-Bold").text(value, RIGHT - 120, y, { width: 120, align: "right" });
    y += 14;
  }

  // Bill to
  y = Math.max(y, MARGIN + 100) + 16;
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("BILL TO", MARGIN, y, { characterSpacing: 0.5 });
  y += 14;
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(11).text(input.agentName || input.agentEmail, MARGIN, y, { width: 300 });
  y = doc.y + 2;
  const billTo = [
    input.agentEmail,
    input.agentPhone,
    input.companyRegistrationNo ? `Reg. no: ${input.companyRegistrationNo}` : null,
    input.companyAddress,
  ].filter((l): l is string => Boolean(l));
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  for (const line of billTo) {
    doc.text(line, MARGIN, y, { width: 300 });
    y = doc.y + 1;
  }

  // Line items
  y += 24;
  const cols = { desc: MARGIN + 10, qty: MARGIN + 240, unit: MARGIN + 315, amount: RIGHT - 110 };
  doc.rect(MARGIN, y, WIDTH, 22).fill(LIGHT);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);
  doc.text("DESCRIPTION", cols.desc, y + 7);
  doc.text("BRANCHES", cols.qty, y + 7, { width: 60, align: "right" });
  doc.text("UNIT PRICE", cols.unit, y + 7, { width: 90, align: "right" });
  doc.text("AMOUNT", cols.amount, y + 7, { width: 100, align: "right" });
  y += 30;
  doc.fillColor(TEXT).font("Helvetica").fontSize(10);
  doc.text(`EasyStaff subscription — ${monthLabel(input)}`, cols.desc, y, { width: 220 });
  doc.text(String(input.branchCount), cols.qty, y, { width: 60, align: "right" });
  doc.text(rm(input.unitPrice), cols.unit, y, { width: 90, align: "right" });
  doc.text(rm(input.amount), cols.amount, y, { width: 100, align: "right" });
  y += 28;
  doc.moveTo(MARGIN, y).lineTo(RIGHT, y).strokeColor("#e7e8e9").lineWidth(1).stroke();

  // Total
  y += 12;
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(10).text("TOTAL DUE", RIGHT - 220, y, { width: 100 });
  doc.fillColor(BRAND).fontSize(14).text(rm(input.paidAt ? 0 : input.amount), RIGHT - 120, y - 2, { width: 120, align: "right" });
  if (input.paidAt) {
    y += 20;
    doc.fillColor("#047857").font("Helvetica-Bold").fontSize(10)
      .text(`PAID on ${day(input.paidAt)} — ${rm(input.amount)}`, MARGIN, y, { width: WIDTH, align: "right" });
  }

  // Payment details
  y += 48;
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("PAYMENT DETAILS", MARGIN, y, { characterSpacing: 0.5 });
  y += 14;
  doc.fillColor(TEXT).font("Helvetica").fontSize(9);
  for (const line of paymentDetails()) {
    doc.text(line, MARGIN, y, { width: WIDTH });
    y = doc.y + 2;
  }
  doc.fillColor(MUTED).text(`Please quote ${number} as the payment reference.`, MARGIN, y + 6, { width: WIDTH });

  doc.end();
  return done;
}
