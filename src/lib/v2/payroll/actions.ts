"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { v2Session, type ActionResult } from "@/lib/v2/session";
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
