import { z } from "zod";
import { PENALTY_TYPES } from "@/lib/v2/pay/config";
import { parseCsv } from "@/lib/v2/pay/rate-card-io";
import { isPeriod } from "@/lib/v2/pay/resolve";
import { capRows, readCsvText, readXlsx, type Sheet, type SheetLimits } from "@/lib/v2/pay/sheet";
import type { ActionResult } from "@/lib/v2/session";
import { FIELDS } from "./parse";

// Reading an uploaded penalty file on the server, for the preview and again for the import.

// ponytail: the file comes in the request body, so Vercel's 4.5 MB body limit applies. QC
// files are far smaller; put them through R2 like the J&T delivery file if one ever isn't.
export const MAX_PENALTY_BYTES = 4_000_000;
const LIMITS: SheetLimits = { sheets: 40, rows: 20_000, cols: 40 };

export async function readPenaltyFile(form: FormData): Promise<ActionResult<{ fileName: string; sheets: Sheet[] }>> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "penalty.err.noFile" };
  if (file.size > MAX_PENALTY_BYTES) return { ok: false, error: "penalty.err.tooBig" };
  const fileName = file.name.slice(0, 200);
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext !== "xlsx" && ext !== "csv") return { ok: false, error: "penalty.err.fileType" };
  try {
    const data = await file.arrayBuffer();
    const sheets = ext === "csv" ? [{ name: fileName.replace(/\.csv$/i, ""), rows: capRows(parseCsv(readCsvText(data)), LIMITS) }] : await readXlsx(data, LIMITS);
    return { ok: true, data: { fileName, sheets } };
  } catch {
    return { ok: false, error: "penalty.err.unreadable" };
  }
}

/** What the import screen decided: the month, and how to read each sheet. */
export const importPlan = z.object({
  period: z.number().refine(isPeriod),
  sheets: z
    .array(
      z.object({
        sheet: z.string().max(200),
        skip: z.boolean(),
        type: z.enum(PENALTY_TYPES).nullable(),
        headerRow: z.number().int().min(-1).max(LIMITS.rows),
        columns: z.partialRecord(z.enum(FIELDS), z.number().int().min(0).max(LIMITS.cols)),
      }),
    )
    .max(LIMITS.sheets),
});
