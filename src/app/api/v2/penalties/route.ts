import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { importPlan, readPenaltyFile } from "@/lib/v2/penalties/file";
import { readPenalties } from "@/lib/v2/penalties/parse";
import { importPenalties } from "@/lib/v2/penalties/store";
import { v2Session } from "@/lib/v2/session";

/**
 * A penalty file as multipart form data. Without `plan`: its sheets as text, for the import
 * preview. With `plan` (the month and how to read each sheet): the cases are imported.
 * A route rather than a server action: action bodies stop at 1 MB.
 */
export async function POST(req: Request) {
  const s = await v2Session();
  if (!s) return NextResponse.json({ error: "error.forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "penalty.err.noFile" }, { status: 400 });
  const file = await readPenaltyFile(form);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: 422 });

  const planText = form.get("plan");
  if (planText === null) return NextResponse.json(file.data);
  let planJson: unknown = null;
  try {
    planJson = JSON.parse(String(planText));
  } catch {}
  const plan = importPlan.safeParse(planJson);
  if (!plan.success) return NextResponse.json({ error: "error.invalid" }, { status: 400 });

  const rows = readPenalties(file.data.sheets, plan.data.sheets);
  const result = await importPenalties({ agentId: s.agentId, actor: s.actor, fileName: file.data.fileName, period: plan.data.period, rows });
  if (!result.ok) return NextResponse.json({ error: result.error, vars: result.vars }, { status: 422 });
  revalidatePath("/app/penalties");
  revalidatePath("/app/payroll", "layout");
  return NextResponse.json(result.data, { status: 201 });
}
