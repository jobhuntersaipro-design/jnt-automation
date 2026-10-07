import { Readable } from "node:stream";
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

/** One worksheet's parsed rows plus what sheet selection needs to know. */
interface SheetResult {
  name: string;
  order: number; // position in the workbook's sheet list
  isDataSheet: boolean;
  rows: ParsedRow[];
}

/** Fields the streaming reader sets at runtime that exceljs's typings leave out. */
type NamedWorksheetReader = ExcelJS.stream.xlsx.WorksheetReader & { name?: string };
interface WorkbookReaderModel {
  model?: { sheets?: { name: string }[] };
}

// The J&T data sheet. Matched case-sensitively, like ExcelJS's getWorksheet.
const PREFERRED_SHEET = "sheet1";

/**
 * Download an Excel file from R2 and parse delivery rows.
 *
 * Columns: A = Waybill, K = Branch, L = Delivery Date,
 *          M = Dispatcher ID, N = Dispatcher Name, Q = Billing Weight
 *
 * The file may contain 60+ sheets — we target "sheet1", falling back to the
 * first sheet with a waybill header.
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
 * Parse an Excel buffer into delivery rows.
 * Exported separately so tests can call it without R2.
 *
 * Streams the workbook row by row instead of loading it whole: a month of
 * J&T data (~200k rows, 165 MB of sheet XML) needs ~2.5 GB as a full
 * workbook, more than a 2 GB Vercel function has. The streaming reader
 * also builds no workbook model, so duplicate sheet names ("Sheet1" next
 * to "sheet1" in some J&T exports) can't break the load.
 *
 * @param onProgress optional callback for running row counts. Fired every
 *                   ~1000 valid rows and once at end-of-parse.
 */
export async function parseExcelBuffer(
  buffer: Uint8Array,
  onProgress?: (rowsParsed: number) => void,
): Promise<ParsedRow[]> {
  try {
    return await parseXlsxStream(buffer, onProgress);
  } catch {
    // The streaming reader stops early on zips whose entries are stored
    // uncompressed (some exporters write them that way) and then fails.
    // Re-compress and try once more; a file that isn't a zip at all throws
    // JSZip's error here.
    const zip = await JSZip.loadAsync(buffer);
    const repacked = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return parseXlsxStream(repacked, onProgress);
  }
}

async function parseXlsxStream(
  buffer: Uint8Array,
  onProgress?: (rowsParsed: number) => void,
): Promise<ParsedRow[]> {
  // Readable.from emits a Buffer as one chunk, but would iterate a plain
  // Uint8Array byte by byte. Wrap without copying.
  const input = Readable.from(
    Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength),
  );
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input, {
    sharedStrings: "cache",
    styles: "cache", // needed to turn date-formatted numbers into Dates
    hyperlinks: "ignore",
    worksheets: "emit",
    entries: "ignore",
  });

  let candidates: SheetResult[] = [];
  let seen = 0;
  for await (const ws of reader) {
    const name = (ws as NamedWorksheetReader).name ?? "";
    const order = sheetOrder(reader, name, seen++);
    const sheet = await readSheet(ws, name, order, onProgress);
    candidates = keepCandidates([...candidates, sheet]);
  }

  const chosen = pickSheet(candidates);
  if (!chosen) throw new Error("No worksheet found in file");

  if (onProgress) onProgress(chosen.rows.length);
  return chosen.rows;
}

/** Position of a sheet in workbook.xml; falls back to the order it streamed in. */
function sheetOrder(
  reader: ExcelJS.stream.xlsx.WorkbookReader,
  name: string,
  fallback: number,
): number {
  const sheets = (reader as unknown as WorkbookReaderModel).model?.sheets;
  const index = sheets?.findIndex((s) => s.name === name) ?? -1;
  return index >= 0 ? index : fallback;
}

async function readSheet(
  ws: ExcelJS.stream.xlsx.WorksheetReader,
  name: string,
  order: number,
  onProgress?: (rowsParsed: number) => void,
): Promise<SheetResult> {
  const rows: ParsedRow[] = [];
  let hasWaybillHeader = false;
  let hasBodyRows = false;

  for await (const row of ws) {
    if (row.number === 1) {
      hasWaybillHeader = cellToString(row.getCell(1)).toLowerCase().includes("waybill");
      continue;
    }
    hasBodyRows = true;

    const parsed = parseRow(row);
    if (!parsed) continue;
    rows.push(parsed);

    if (onProgress && rows.length % 1000 === 0) {
      onProgress(rows.length);
    }
  }

  return { name, order, isDataSheet: hasWaybillHeader && hasBodyRows, rows };
}

function parseRow(row: ExcelJS.Row): ParsedRow | null {
  const dispatcherId = cellToString(row.getCell(13)); // Column M
  if (!dispatcherId) return null; // skip rows without dispatcher ID

  const waybillNumber = cellToString(row.getCell(1)); // Column A
  if (!waybillNumber) return null;
  // Sub-parcel rows (e.g. "680030939458201-02") have no weight and are
  // billed under the parent waybill — exclude from order counts.
  if (waybillNumber.includes("-")) return null;

  // Skip rows whose billing-weight cell is blank — those parcels weren't
  // weighed and should not contribute to commission or order counts.
  const weightCell = row.getCell(17); // Column Q
  if (isEmptyCell(weightCell)) return null;

  return {
    waybillNumber,
    branchName: cellToString(row.getCell(11)), // Column K
    deliveryDate: cellToDate(row.getCell(12)), // Column L
    dispatcherId,
    dispatcherName: cellToString(row.getCell(14)), // Column N
    billingWeight: cellToWeight(weightCell),
  };
}

/**
 * "sheet1" if it holds data, otherwise the first data sheet in workbook
 * order, otherwise "sheet1" (or the first sheet) as-is.
 */
function pickSheet(sheets: SheetResult[]): SheetResult | undefined {
  const byOrder = [...sheets].sort((a, b) => a.order - b.order);
  const preferred = sheets.find((s) => s.name === PREFERRED_SHEET) ?? byOrder[0];
  if (preferred?.isDataSheet) return preferred;
  return byOrder.find((s) => s.isDataSheet) ?? preferred;
}

/**
 * Drop sheets that pickSheet can no longer choose, whatever streams in
 * later, so at most three sheets' rows are held in memory.
 */
function keepCandidates(sheets: SheetResult[]): SheetResult[] {
  const byOrder = [...sheets].sort((a, b) => a.order - b.order);
  const keep = new Set([
    sheets.find((s) => s.name === PREFERRED_SHEET),
    byOrder[0],
    byOrder.find((s) => s.isDataSheet),
  ]);
  return sheets.filter((s) => keep.has(s));
}

function cellToString(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  return String(cell.value).trim();
}

function isEmptyCell(cell: ExcelJS.Cell): boolean {
  if (cell.value == null) return true;
  if (typeof cell.value === "string") return cell.value.trim() === "";
  return false;
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
