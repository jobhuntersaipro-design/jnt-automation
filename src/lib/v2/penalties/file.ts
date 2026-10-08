import { z } from "zod";
import { PENALTY_TYPES } from "@/lib/v2/pay/config";
import { isPeriod } from "@/lib/v2/pay/resolve";
import { SHEET_LIMITS } from "@/lib/v2/pay/sheet-upload";
import { FIELDS } from "./parse";

/** What the import screen decided: the month, and how to read each sheet. */
export const importPlan = z.object({
  period: z.number().refine(isPeriod),
  sheets: z
    .array(
      z.object({
        sheet: z.string().max(200),
        skip: z.boolean(),
        type: z.enum(PENALTY_TYPES).nullable(),
        headerRow: z.number().int().min(-1).max(SHEET_LIMITS.rows),
        columns: z.partialRecord(z.enum(FIELDS), z.number().int().min(0).max(SHEET_LIMITS.cols)),
      }),
    )
    .max(SHEET_LIMITS.sheets),
});
