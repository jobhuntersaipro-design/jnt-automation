import { GetObjectCommand } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";
import JSZip from "jszip";
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
 *
 * @param onProgress optional callback invoked with the running row count
 *                   as parsing proceeds. Called at most every 1000 rows to
 *                   avoid excessive overhead. The caller is responsible for
 *                   any throttling before writing to a durable store.
 */
export async function parseExcelFromR2(
  r2Key: string,
  onProgress?: (rowsParsed: number) => void,
): Promise<ParsedRow[]> {
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
  );

  if (!obj.Body) throw new Error("Empty file from R2");

  const bytes = await obj.Body.transformToByteArray();
  return parseExcelBuffer(bytes, onProgress);
}

/**
 * Rewrite any duplicate case-insensitive sheet names in an xlsx buffer
 * before handing it to exceljs. J&T exports sometimes contain both
 * "Sheet1" (cover) and "sheet1" (data), which exceljs rejects with
 * "Worksheet name already exists: sheet1" during load.
 *
 * Returns the original buffer unchanged when there is no collision.
 */
async function sanitizeWorkbookSheetNames(buffer: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const wbFile = zip.file("xl/workbook.xml");
  if (!wbFile) return buffer;

  const wbXml = await wbFile.async("string");
  const sheetTagRe = /<sheet\b[^>]*\/>/g;
  const tags = wbXml.match(sheetTagRe);
  if (!tags || tags.length < 2) return buffer;

  // Check for collisions
  const seen = new Map<string, number>();
  let hasCollision = false;
  for (const tag of tags) {
    const nameMatch = tag.match(/\bname="([^"]*)"/);
    if (!nameMatch) continue;
    const lower = nameMatch[1].toLowerCase();
    const count = seen.get(lower) ?? 0;
    if (count > 0) hasCollision = true;
    seen.set(lower, count + 1);
  }

  if (!hasCollision) return buffer;

  // Rewrite each tag, appending _dupN to later occurrences of case-insensitive matches
  const usedNames = new Set<string>();
  const newXml = wbXml.replace(sheetTagRe, (tag) => {
    const nameMatch = tag.match(/\bname="([^"]*)"/);
    if (!nameMatch) return tag;
    const original = nameMatch[1];
    const lower = original.toLowerCase();
    if (!usedNames.has(lower)) {
      usedNames.add(lower);
      return tag;
    }
    // Find a non-colliding rename — _dup1, _dup2, etc.
    let suffix = 1;
    let candidate = `${original}_dup${suffix}`;
    while (usedNames.has(candidate.toLowerCase())) {
      suffix++;
      candidate = `${original}_dup${suffix}`;
    }
    usedNames.add(candidate.toLowerCase());
    return tag.replace(`name="${original}"`, `name="${candidate}"`);
  });

  zip.file("xl/workbook.xml", newXml);
  return zip.generateAsync({ type: "uint8array" });
}

/**
 * Parse an Excel buffer into delivery rows.
 * Exported separately so tests can call it without R2.
 *
 * @param onProgress optional callback for running row counts. Fired every
 *                   ~1000 valid rows and once at end-of-parse.
 */
export async function parseExcelBuffer(
  buffer: Uint8Array,
  onProgress?: (rowsParsed: number) => void,
): Promise<ParsedRow[]> {
  const sanitized = await sanitizeWorkbookSheetNames(buffer);

  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(sanitized as any);

  // Prefer the lowercase "sheet1" (the J&T data sheet); fall back to first
  // non-empty worksheet if it's missing or empty.
  let ws = workbook.getWorksheet("sheet1") ?? workbook.worksheets[0];
  // If the preferred sheet is near-empty (cover sheet only), pick the first
  // worksheet with a header row we recognise.
  const isDataSheet = (sheet: ExcelJS.Worksheet) => {
    const header = sheet.getRow(1);
    const a = String(header.getCell(1).value ?? "").toLowerCase();
    return a.includes("waybill") && sheet.rowCount > 1;
  };
  if (ws && !isDataSheet(ws)) {
    const better = workbook.worksheets.find(isDataSheet);
    if (better) ws = better;
  }
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

    if (onProgress && rows.length % 1000 === 0) {
      onProgress(rows.length);
    }
  });

  if (onProgress) onProgress(rows.length);
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
