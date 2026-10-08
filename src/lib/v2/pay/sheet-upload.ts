import { parseCsv } from "@/lib/v2/pay/rate-card-io";
import { capRows, readCsvText, readXlsx, type Sheet, type SheetLimits } from "@/lib/v2/pay/sheet";
import type { ActionResult } from "@/lib/v2/session";

// Reads a spreadsheet posted as multipart form data (penalty files, the agent's own payroll sheet).

// ponytail: the file comes in the request body, so Vercel's 4.5 MB body limit applies. These
// files are far smaller; put them through R2 like the J&T delivery file if one ever isn't.
export const MAX_SHEET_BYTES = 4_000_000;
export const SHEET_LIMITS: SheetLimits = { sheets: 40, rows: 20_000, cols: 40 };

export async function readSheetUpload(form: FormData): Promise<ActionResult<{ fileName: string; sheets: Sheet[] }>> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "sheet.err.noFile" };
  if (file.size > MAX_SHEET_BYTES) return { ok: false, error: "sheet.err.tooBig" };
  const fileName = file.name.slice(0, 200);
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext !== "xlsx" && ext !== "csv") return { ok: false, error: "sheet.err.fileType" };
  try {
    const data = await file.arrayBuffer();
    const sheets = ext === "csv" ? [{ name: fileName.replace(/\.csv$/i, ""), rows: capRows(parseCsv(readCsvText(data)), SHEET_LIMITS) }] : await readXlsx(data, SHEET_LIMITS);
    return { ok: true, data: { fileName, sheets } };
  } catch {
    return { ok: false, error: "sheet.err.unreadable" };
  }
}
