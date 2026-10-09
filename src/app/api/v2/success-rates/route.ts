import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/v2/pay/resolve";
import { readSheetUpload } from "@/lib/v2/pay/sheet-upload";
import { v2Session } from "@/lib/v2/session";
import { idOptions } from "@/lib/v2/success/data";
import { planReport, readable, readReport, reportPlan } from "@/lib/v2/success/report";

/**
 * J&T's success-rate report as multipart form data. Without `plan`: its sheets and the guessed columns, for the
 * preview. With `plan` and `period`: the rows are saved for that month (importing again updates them).
 * A branch supervisor's import keeps their branches' J&T IDs only.
 */
export async function POST(req: Request) {
  const s = await v2Session();
  if (!s) return NextResponse.json({ error: "error.forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "sheet.err.noFile" }, { status: 400 });
  const file = await readSheetUpload(form);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: 422 });

  const planText = form.get("plan");
  if (planText === null) return NextResponse.json({ ...file.data, plan: planReport(file.data.sheets) });
  let planJson: unknown = null;
  try {
    planJson = JSON.parse(String(planText));
  } catch {}
  const parsed = reportPlan.safeParse(planJson);
  const period = Number(form.get("period"));
  const sheet = parsed.success ? file.data.sheets.find((x) => x.name === parsed.data.sheet) : undefined;
  if (!parsed.success || !sheet || !readable(parsed.data.columns) || !isPeriod(period)) return NextResponse.json({ error: "error.invalid" }, { status: 400 });

  const { rows, skipped } = readReport(sheet, parsed.data);
  const allowed = s.member ? new Set((await idOptions(s)).map((o) => o.extId)) : null;
  const kept = allowed ? rows.filter((r) => allowed.has(r.extId)) : rows;
  if (kept.length === 0) return NextResponse.json({ error: "success.err.noRows" }, { status: 422 });
  await prisma.$transaction([
    ...kept.map((r) => {
      const data = { name: r.name, outlet: r.outlet, rateBp: r.rateBp, delivered: r.delivered, total: r.total, fileName: file.data.fileName, actor: s.actor };
      return prisma.successRate.upsert({
        where: { agentId_period_extId: { agentId: s.agentId, period, extId: r.extId } },
        create: { agentId: s.agentId, period, extId: r.extId, ...data },
        update: data,
      });
    }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "successRate", detail: { month: period, file: file.data.fileName, rows: kept.length } } }),
  ]);
  revalidatePath("/app/success-rates");
  revalidatePath("/app/payroll", "layout");
  return NextResponse.json({ saved: kept.length, skipped: skipped.length, others: rows.length - kept.length }, { status: 201 });
}
