"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { EMPLOYMENTS, KINDS, parseConfig, type Employment, type Kind } from "@/lib/v2/pay/config";
import { MAX_FILE_BYTES, parseCsv } from "@/lib/v2/pay/rate-card-io";
import { capRows, readCsvText, readXlsx, type Sheet } from "@/lib/v2/pay/sheet";
import { TEMPLATES } from "@/lib/v2/pay/templates";
import { v2Session, type ActionResult } from "@/lib/v2/session";

// Mutations behind the v2 rule screens. Each one checks the caller is a v2 account,
// touches only that account's rows, and leaves an audit entry.

const period = z.number().int().refine((p) => p >= 200001 && p <= 299912 && p % 100 >= 1 && p % 100 <= 12);
const name = z.string().trim().min(1).max(80);

type Detail = Record<string, string | number | boolean | null>;

async function audit(agentId: string, actor: string | null, ruleId: string, action: string, detail: Detail) {
  await prisma.ruleAudit.create({ data: { agentId, actor, ruleId, action, detail } });
}

function refresh(ruleId?: string) {
  revalidatePath("/app/rules");
  if (ruleId) revalidatePath(`/app/rules/${ruleId}`);
}

const ownRule = (agentId: string, id: string) => prisma.payRule.findFirst({ where: { id, agentId, archivedAt: null } });

export async function createRule(input: { kind: Kind; name: string; effectiveFrom: number }): Promise<ActionResult<{ id: string }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = z.object({ kind: z.enum(KINDS), name, effectiveFrom: period }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const { kind, effectiveFrom } = parsed.data;
  const rule = await prisma.payRule.create({
    data: {
      agentId: s.agentId,
      kind,
      name: parsed.data.name,
      versions: { create: { effectiveFrom, config: TEMPLATES[kind], createdBy: s.actor, source: "template" } },
    },
  });
  await audit(s.agentId, s.actor, rule.id, "create", { name: rule.name, month: effectiveFrom });
  refresh();
  return { ok: true, data: { id: rule.id } };
}

/** Saves rates from a month on. Saving over an existing month needs `replace`, never silently. */
export async function saveVersion(input: { ruleId: string; effectiveFrom: number; config: unknown; replace?: boolean; source?: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  if (!period.safeParse(input.effectiveFrom).success) return { ok: false, error: "error.invalid" };
  const config = parseConfig(input.config);
  if (!config) return { ok: false, error: "rule.err.invalidConfig" };
  const rule = await ownRule(s.agentId, input.ruleId);
  if (!rule) return { ok: false, error: "error.notFound" };

  const key = { ruleId_effectiveFrom: { ruleId: rule.id, effectiveFrom: input.effectiveFrom } };
  const existing = await prisma.payRuleVersion.findUnique({ where: key, select: { id: true } });
  if (existing && !input.replace) return { ok: false, error: "rule.err.versionExists" };
  const source = input.source?.slice(0, 200) ?? "manual";
  const json = config as unknown as Prisma.InputJsonValue;
  await prisma.payRuleVersion.upsert({
    where: key,
    create: { ruleId: rule.id, effectiveFrom: input.effectiveFrom, config: json, createdBy: s.actor, source },
    update: { config: json, createdBy: s.actor, source, createdAt: new Date() },
  });
  await audit(s.agentId, s.actor, rule.id, existing ? "replace" : "version", { month: input.effectiveFrom, source });
  refresh(rule.id);
  return { ok: true, data: undefined };
}

export async function deleteVersion(input: { versionId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const version = await prisma.payRuleVersion.findFirst({
    where: { id: input.versionId, rule: { agentId: s.agentId, archivedAt: null } },
    include: { rule: { select: { id: true, _count: { select: { versions: true } } } } },
  });
  if (!version) return { ok: false, error: "error.notFound" };
  if (version.rule._count.versions <= 1) return { ok: false, error: "rule.err.lastVersion" };
  await prisma.payRuleVersion.delete({ where: { id: version.id } });
  await audit(s.agentId, s.actor, version.rule.id, "deleteVersion", { month: version.effectiveFrom });
  refresh(version.rule.id);
  return { ok: true, data: undefined };
}

export async function renameRule(input: { ruleId: string; name: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const rule = await ownRule(s.agentId, input.ruleId);
  if (!rule) return { ok: false, error: "error.notFound" };
  await prisma.payRule.update({ where: { id: rule.id }, data: { name: parsed.data } });
  await audit(s.agentId, s.actor, rule.id, "rename", { from: rule.name, to: parsed.data });
  refresh(rule.id);
  return { ok: true, data: undefined };
}

/** Archived rules stop applying to unfinalised months; finalised runs keep what they used. */
export async function archiveRule(input: { ruleId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const rule = await ownRule(s.agentId, input.ruleId);
  if (!rule) return { ok: false, error: "error.notFound" };
  await prisma.payRule.update({ where: { id: rule.id }, data: { archivedAt: new Date() } });
  await audit(s.agentId, s.actor, rule.id, "archive", { name: rule.name });
  refresh(rule.id);
  return { ok: true, data: undefined };
}

/** A new rule starting from another's latest rates; it applies to no one until assigned. */
export async function copyRule(input: { ruleId: string; name: string }): Promise<ActionResult<{ id: string }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const source = await prisma.payRule.findFirst({
    where: { id: input.ruleId, agentId: s.agentId, archivedAt: null },
    include: { versions: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  const latest = source?.versions[0];
  if (!source || !latest) return { ok: false, error: "error.notFound" };
  const copy = await prisma.payRule.create({
    data: {
      agentId: s.agentId,
      kind: source.kind,
      name: parsed.data,
      versions: { create: { effectiveFrom: latest.effectiveFrom, config: latest.config as Prisma.InputJsonValue, createdBy: s.actor, source: `copy: ${source.name}` } },
    },
  });
  await audit(s.agentId, s.actor, copy.id, "copy", { from: source.name, month: latest.effectiveFrom });
  refresh();
  return { ok: true, data: { id: copy.id } };
}

export async function addAssignment(input: {
  ruleId: string;
  branchId: string | null;
  dispatcherId: string | null;
  employment: Employment | null;
  effectiveFrom: number;
}): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const parsed = z
    .object({
      ruleId: z.string(),
      branchId: z.string().nullable(),
      dispatcherId: z.string().nullable(),
      employment: z.enum(EMPLOYMENTS).nullable(),
      effectiveFrom: period,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "error.invalid" };
  const a = parsed.data;
  const rule = await ownRule(s.agentId, a.ruleId);
  if (!rule) return { ok: false, error: "error.notFound" };
  const [branch, dispatcher] = await Promise.all([
    a.branchId ? prisma.branch.findFirst({ where: { id: a.branchId, agentId: s.agentId, isDemo: false }, select: { code: true } }) : null,
    a.dispatcherId ? prisma.dispatcher.findFirst({ where: { id: a.dispatcherId, agentId: s.agentId }, select: { name: true } }) : null,
  ]);
  if ((a.branchId && !branch) || (a.dispatcherId && !dispatcher)) return { ok: false, error: "error.notFound" };
  const duplicate = await prisma.payRuleAssignment.findFirst({
    where: { ruleId: rule.id, branchId: a.branchId, dispatcherId: a.dispatcherId, employment: a.employment, effectiveFrom: a.effectiveFrom },
    select: { id: true },
  });
  if (duplicate) return { ok: false, error: "rule.err.assignmentExists" };
  await prisma.payRuleAssignment.create({ data: { ...a, agentId: s.agentId, kind: rule.kind } });
  await audit(s.agentId, s.actor, rule.id, "assign", {
    outlet: branch?.code ?? null,
    dispatcher: dispatcher?.name ?? null,
    employment: a.employment,
    month: a.effectiveFrom,
  });
  refresh(rule.id);
  return { ok: true, data: undefined };
}

export async function removeAssignment(input: { assignmentId: string }): Promise<ActionResult> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const a = await prisma.payRuleAssignment.findFirst({
    where: { id: input.assignmentId, agentId: s.agentId },
    include: { branch: { select: { code: true } }, dispatcher: { select: { name: true } } },
  });
  if (!a) return { ok: false, error: "error.notFound" };
  await prisma.payRuleAssignment.delete({ where: { id: a.id } });
  await audit(s.agentId, s.actor, a.ruleId, "unassign", {
    outlet: a.branch?.code ?? null,
    dispatcher: a.dispatcher?.name ?? null,
    employment: a.employment,
    month: a.effectiveFrom,
  });
  refresh(a.ruleId);
  return { ok: true, data: undefined };
}

/** Reads a rate card for the import preview. Nothing is stored: the numbers arrive as an editor draft. */
export async function readRateCardFile(form: FormData): Promise<ActionResult<{ name: string; sheets: Sheet[] }>> {
  const s = await v2Session();
  if (!s) return { ok: false, error: "error.forbidden" };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "import.err.noFile" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "import.err.tooBig" };
  const fileName = file.name.slice(0, 120);
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext !== "xlsx" && ext !== "csv") return { ok: false, error: "import.err.fileType" };
  try {
    const data = await file.arrayBuffer();
    const sheets = ext === "csv" ? [{ name: fileName, rows: capRows(parseCsv(readCsvText(data))) }] : await readXlsx(data);
    return { ok: true, data: { name: fileName, sheets } };
  } catch {
    return { ok: false, error: "import.err.unreadable" };
  }
}
