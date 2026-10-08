import ExcelJS from "exceljs";

// Server side: turns an uploaded rate card or penalty file (.xlsx or .csv) into text cells
// for the import preview. Both are small, so the whole workbook loads in memory.

export interface SheetLimits {
  sheets: number;
  rows: number;
  cols: number;
}
const RATE_CARD: SheetLimits = { sheets: 10, rows: 1000, cols: 30 };

export interface Sheet {
  name: string;
  /** Text cells; index + 1 is the sheet row. */
  rows: string[][];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const iso = v.toISOString(); // exceljs gives the cell's wall-clock time as UTC
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
  }
  if (typeof v !== "object") return String(v); // numbers at full precision, not as displayed
  if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // a formula's last value
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return String(v.text); // hyperlink
  return ""; // #N/A and other errors
}

export const capRows = (rows: string[][], limits = RATE_CARD) => rows.slice(0, limits.rows).map((r) => r.slice(0, limits.cols).map((c) => c.trim()));

export async function readXlsx(data: ArrayBuffer, limits = RATE_CARD): Promise<Sheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook.worksheets.slice(0, limits.sheets).map((ws) => {
    const rows: string[][] = [];
    ws.eachRow((row, n) => {
      if (n <= limits.rows) rows[n - 1] = Array.from({ length: Math.min(row.cellCount, limits.cols) }, (_, c) => cellText(row.getCell(c + 1).value));
    });
    return { name: ws.name, rows: capRows(Array.from(rows, (r) => r ?? []), limits) };
  });
}

/** UTF-8, or GB18030 for Excel's plain "CSV" on Chinese Windows. */
export function readCsvText(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("gb18030").decode(data);
  }
}
