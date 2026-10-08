import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseExcelFromR2, type ParsedRow } from "@/lib/upload/parser";
import { createRun } from "@/lib/v2/payroll/run";
import { v2Session } from "@/lib/v2/session";

// A month's J&T file can hold ~200k rows: parsing takes up to half a minute.
export const maxDuration = 300;

const body = z.object({ key: z.string().min(1).max(300), fileName: z.string().min(1).max(300) });

/** Works out a month's payroll from a J&T file the browser has put in R2 (see getUploadUrl). */
export async function POST(req: Request) {
  const s = await v2Session();
  if (!s) return NextResponse.json({ error: "error.forbidden" }, { status: 403 });
  const input = body.safeParse(await req.json().catch(() => null));
  // Only files this account uploaded: upload URLs are handed out under its own prefix.
  if (!input.success || !input.data.key.startsWith(`v2/payroll/${s.agentId}/`)) return NextResponse.json({ error: "error.invalid" }, { status: 400 });

  let rows: ParsedRow[];
  try {
    rows = await parseExcelFromR2(input.data.key);
  } catch (e) {
    console.error("[v2 payroll] could not read", input.data.key, e);
    return NextResponse.json({ error: "run.err.unreadable" }, { status: 422 });
  }
  const result = await createRun({ agentId: s.agentId, actor: s.actor, key: input.data.key, fileName: input.data.fileName, rows });
  if (!result.ok) return NextResponse.json({ error: result.error, vars: result.vars }, { status: 422 });
  revalidatePath("/app/payroll", "layout");
  return NextResponse.json(result.data, { status: 201 });
}
