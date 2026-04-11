import { GetObjectCommand } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";
import { r2, R2_BUCKET } from "@/lib/r2";

export interface ParsedRow {
  waybillNumber: string;
  branchName: string;
  deliveryDate: Date | null;
  dispatcherId: string;
  dispatcherName: string;
  billingWeight: number;
}

/**
 * Download an Excel file from R2 and parse delivery rows.
 *
 * Columns: A = Waybill, K = Branch, L = Delivery Date,
 *          M = Dispatcher ID, N = Dispatcher Name, Q = Billing Weight
 *
 * The file may contain 60+ sheets — we always target "sheet1" (fallback: first sheet).
 */
export async function parseExcelFromR2(r2Key: string): Promise<ParsedRow[]> {
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
  );

  if (!obj.Body) throw new Error("Empty file from R2");

  const bytes = await obj.Body.transformToByteArray();
  return parseExcelBuffer(bytes);
}

/**
 * Parse an Excel buffer into delivery rows.
 * Exported separately so tests can call it without R2.
 */
export async function parseExcelBuffer(buffer: Uint8Array): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const ws = workbook.getWorksheet("sheet1") ?? workbook.worksheets[0];
  if (!ws) throw new Error("No worksheet found in file");

  const rows: ParsedRow[] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Skip header row
    if (rowNumber === 1) return;

    const dispatcherId = cellToString(row.getCell(13)); // Column M
    if (!dispatcherId) return; // skip rows without dispatcher ID

    const waybillNumber = cellToString(row.getCell(1)); // Column A
    if (!waybillNumber) return;

    const branchName = cellToString(row.getCell(11)); // Column K
    const deliveryDate = cellToDate(row.getCell(12)); // Column L
    const dispatcherName = cellToString(row.getCell(14)); // Column N
    const billingWeight = cellToWeight(row.getCell(17)); // Column Q

    rows.push({
      waybillNumber,
      branchName,
      deliveryDate,
      dispatcherId,
      dispatcherName,
      billingWeight,
    });
  });

  return rows;
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  return String(cell.value).trim();
}

function cellToDate(cell: ExcelJS.Cell): Date | null {
  if (cell.value == null) return null;
  if (cell.value instanceof Date) return cell.value;
  // Excel serial date number
  if (typeof cell.value === "number") {
    return excelSerialToDate(cell.value);
  }
  const parsed = new Date(String(cell.value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function cellToWeight(cell: ExcelJS.Cell): number {
  if (cell.value == null) return 0;
  if (typeof cell.value === "number") return cell.value;
  // Strip non-numeric chars (except decimal point) and parse
  const cleaned = String(cell.value).replace(/[^0-9.]/g, "");
  const weight = parseFloat(cleaned);
  return isNaN(weight) ? 0 : weight;
}

/**
 * Convert an Excel serial date number to a JS Date.
 * Excel epoch is 1900-01-01 with a known leap-year bug (day 60 = Feb 29 1900 doesn't exist).
 */
function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + serial * 86400000);
}
