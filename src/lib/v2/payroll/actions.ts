"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { v2Session, type ActionResult } from "@/lib/v2/session";
import { planCover } from "./cover";
import { branchPenaltyCounts } from "./data";
import { getMonthClose } from "./month";
import { calculateRun, finaliseRun } from "./run";

// Mutations behind the v2 payroll screens; every one is scoped to the caller's account.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const refresh = () => revalidatePath("/app/payroll", "layout");

/** A one-off URL for the browser to put the J&T file straight into R2: the file is too big for a request body. */
export async function getUploadUrl(input: { fileName: string; size: number }): Promise<ActionResult<{ key: string; url: string; contentType: string }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  if (!/\.xlsx$/i.test(String(input.fileName))) return { ok: false, error: "run.err.fileType" };
  if (!(input.size > 0) || input.size > MAX_UPLOAD_BYTES) return { ok: false, error: "run.err.tooBig" };
  // Kept apart from v1's uploads/ and avatars/; the run API only reads keys under the caller's prefix.
  const key = `v2/payroll/${s.agentId}/${crypto.randomUUID()}.xlsx`;
  const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: XLSX }), { expiresIn: 600 });
  return { ok: true, data: { key, url, contentType: XLSX } };
}

export async function recalculateRun(input: { runId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const result = await calculateRun(s.agentId, input.runId);
  if (result.ok) refresh();
  return result;
}

/** Step 2 of New payroll: the branch's penalty file for the month is in. Recalculates so the review includes it. */
export async function confirmPenalties(input: { runId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const run = await prisma.payrollRun.findFirst({
    where: { id: input.runId, agentId: s.agentId, status: "DRAFT" },
    select: { id: true, period: true, branch: { select: { id: true, code: true } } },
  });
  if (!run) return { ok: false, error: "error.notFound" };
  // Every branch gets J&T HQ penalties every month, so a month without any for the branch means the file is missing.
  const { cases } = await branchPenaltyCounts(s.agentId, run.period, run.branch);
  if (cases === 0) return { ok: false, error: "wizard.penalties.missing", vars: { outlet: run.branch.code } };
  await prisma.payrollRun.update({ where: { id: run.id }, data: { penaltiesCheckedAt: new Date() } });
  const result = await calculateRun(s.agentId, run.id);
  if (result.ok) refresh();
  return result;
}

/**
 * One click for "no rate card covers this month": the account's rate cards start from the run's month instead,
 * numbers unchanged (see planCover), then the draft is recalculated.
 */
export async function coverRunMonth(input: { runId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const run = await prisma.payrollRun.findFirst({ where: { id: input.runId, agentId: s.agentId }, select: { id: true, period: true, status: true, branch: { select: { code: true } } } });
  if (!run) return { ok: false, error: "error.notFound" };
  if (run.status === "FINAL") return { ok: false, error: "run.err.final", vars: { outlet: run.branch.code } };
  const rules = await prisma.payRule.findMany({
    where: { agentId: s.agentId, kind: "PARCEL", archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      versions: { select: { id: true, effectiveFrom: true } },
      assignments: { select: { id: true, branchId: true, dispatcherId: true, employment: true, effectiveFrom: true } },
    },
  });
  const plan = planCover(run.period, rules);
  if (!plan) return { ok: false, error: "run.cover.noCard" };
  const month = run.period;
  await prisma.$transaction([
    prisma.payRuleVersion.updateMany({ where: { id: { in: plan.versions } }, data: { effectiveFrom: month } }),
    prisma.payRuleAssignment.updateMany({ where: { id: { in: plan.assignments }, agentId: s.agentId }, data: { effectiveFrom: month } }),
    ...(plan.assignEveryone ? [prisma.payRuleAssignment.create({ data: { agentId: s.agentId, ruleId: plan.assignEveryone, kind: "PARCEL", effectiveFrom: month } })] : []),
    // One entry per card touched, so its history says why its start month moved.
    ...rules
      .filter((r) => r.id === plan.assignEveryone || r.versions.some((v) => plan.versions.includes(v.id)) || r.assignments.some((a) => plan.assignments.includes(a.id)))
      .map((r) => prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, ruleId: r.id, action: "cover", detail: { month, outlet: run.branch.code } } })),
  ]);
  const result = await calculateRun(s.agentId, run.id);
  revalidatePath("/app/rules", "layout");
  if (result.ok) refresh();
  return result;
}

/** Month close: finalises every branch of the month that's ready (the same checks as one run). */
export async function finaliseMonth(input: { period: number; outlet: string | null }): Promise<ActionResult<{ branches: string[] }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const rows = await getMonthClose(s.agentId, input.period, input.outlet);
  const branches: string[] = [];
  for (const row of rows) {
    if (row.status === "ready" && row.run && (await finaliseRun(s.agentId, s.actor, row.run.id)).ok) branches.push(row.branch);
  }
  refresh();
  return { ok: true, data: { branches } };
}

export async function finalise(input: { runId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const result = await finaliseRun(s.agentId, s.actor, input.runId);
  if (result.ok) refresh();
  return result;
}

export async function deleteRun(input: { runId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const run = await prisma.payrollRun.findFirst({ where: { id: input.runId, agentId: s.agentId }, select: { id: true, status: true, period: true, branch: { select: { code: true } } } });
  if (!run) return { ok: false, error: "error.notFound" };
  if (run.status === "FINAL") return { ok: false, error: "run.err.final", vars: { outlet: run.branch.code } };
  await prisma.$transaction([
    prisma.payrollRun.delete({ where: { id: run.id } }),
    prisma.ruleAudit.create({ data: { agentId: s.agentId, actor: s.actor, action: "deleteRun", detail: { outlet: run.branch.code, month: run.period } } }),
  ]);
  refresh();
  return { ok: true, data: undefined };
}

/** Explains a difference on the month's comparison; `excluded` leaves it out as explained. */
export async function saveCheckNote(input: { period: number; key: string; note: string; excluded: boolean }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const check = await prisma.payrollCheck.findUnique({ where: { agentId_period: { agentId: s.agentId, period: input.period } } });
  if (!check) return { ok: false, error: "error.notFound" };
  const notes = { ...((check.notes ?? {}) as Record<string, { note: string; excluded: boolean }>) };
  const note = String(input.note ?? "").trim().slice(0, 500);
  if (note || input.excluded) notes[String(input.key).slice(0, 300)] = { note, excluded: !!input.excluded };
  else delete notes[input.key];
  await prisma.payrollCheck.update({ where: { id: check.id }, data: { notes } });
  revalidatePath("/app/payroll/check");
  return { ok: true, data: undefined };
}

export async function deleteCheck(input: { period: number }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  await prisma.payrollCheck.deleteMany({ where: { agentId: s.agentId, period: input.period } });
  revalidatePath("/app/payroll/check");
  return { ok: true, data: undefined };
}
