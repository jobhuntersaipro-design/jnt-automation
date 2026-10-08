import ExcelJS from "exceljs";

// Server side: turns an uploaded rate card (.xlsx or .csv) into text cells for the import
// preview. Rate cards are small, so the whole workbook loads in memory.

const MAX_SHEETS = 10;
const MAX_ROWS = 1000;
const MAX_COLS = 30;

export interface Sheet {
  name: string;
  /** Text cells; index + 1 is the sheet row. */
  rows: string[][];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v !== "object") return String(v); // numbers at full precision, not as displayed
  if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // a formula's last value
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return String(v.text); // hyperlink
  return ""; // #N/A and other errors
}

export const capRows = (rows: string[][]) => rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => c.trim()));

export async function readXlsx(data: ArrayBuffer): Promise<Sheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  return workbook.worksheets.slice(0, MAX_SHEETS).map((ws) => {
    const rows: string[][] = [];
    ws.eachRow((row, n) => {
      if (n <= MAX_ROWS) rows[n - 1] = Array.from({ length: Math.min(row.cellCount, MAX_COLS) }, (_, c) => cellText(row.getCell(c + 1).value));
    });
    return { name: ws.name, rows: capRows(Array.from(rows, (r) => r ?? [])) };
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
