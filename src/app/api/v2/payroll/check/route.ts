import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { readSheetUpload } from "@/lib/v2/pay/sheet-upload";
import { checkPlan, saveCheck } from "@/lib/v2/payroll/check";
import { readSheetPeople } from "@/lib/v2/payroll/reconcile";
import { v2Session } from "@/lib/v2/session";

/**
 * The agent's own payroll sheet as multipart form data. Without `plan`: its sheets as text, for
 * choosing the columns. With `plan` (the month, the sheet and its columns): the sheet's people
 * and figures are stored for comparing with that month's pay.
 */
export async function POST(req: Request) {
  const s = await v2Session();
  if (!s) return NextResponse.json({ error: "error.forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "sheet.err.noFile" }, { status: 400 });
  const file = await readSheetUpload(form);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: 422 });

  const planText = form.get("plan");
  if (planText === null) return NextResponse.json(file.data);
  let planJson: unknown = null;
  try {
    planJson = JSON.parse(String(planText));
  } catch {}
  const parsed = checkPlan.safeParse(planJson);
  const sheet = parsed.success ? file.data.sheets.find((x) => x.name === parsed.data.plan.sheet) : undefined;
  if (!parsed.success || !sheet || (parsed.data.plan.extId === undefined && parsed.data.plan.name === undefined)) return NextResponse.json({ error: "error.invalid" }, { status: 400 });

  const people = readSheetPeople(sheet, parsed.data.plan);
  if (people.length === 0) return NextResponse.json({ error: "check.err.noPeople" }, { status: 422 });
  await saveCheck({ agentId: s.agentId, actor: s.actor, period: parsed.data.period, fileName: file.data.fileName, plan: parsed.data.plan, people });
  revalidatePath("/app/payroll/check");
  return NextResponse.json({ people: people.length }, { status: 201 });
}
