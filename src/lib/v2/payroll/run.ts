import { Prisma } from "@/generated/prisma/client";
import { normalizeName } from "@/lib/dispatcher-identity/normalize-name";
import { prisma } from "@/lib/prisma";
import type { ParsedRow } from "@/lib/upload/parser";
import { parseConfig } from "@/lib/v2/pay/config";
import type { Parcels } from "@/lib/v2/pay/engine";
import { inForce } from "@/lib/v2/pay/resolve";
import { listAssignments } from "@/lib/v2/people/data";
import { ensureOutlet } from "@/lib/v2/people/outlet";
import type { ActionResult } from "@/lib/v2/session";
import { payDispatcher, type PenaltyCase, type Profile, type VersionRow } from "./calc";
import { summariseRows, type FileDispatcher } from "./file";

// Server side of a payroll run: the J&T file's rows → outlet, dispatchers and their parcels,
// stored on the run → pay worked out from the rules. A finalised run never changes again.

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Audit actions that can change what a run pays. Anything logged after a run's calculation makes it stale. */
const PAY_CHANGES = [
  "version",
  "replace",
  "deleteVersion",
  "archive",
  "assign",
  "unassign",
  "profile",
  "profileDelete",
  "penaltyImport",
  "penaltyDeleteImport",
  "penaltyMatch",
  "penaltyIgnore",
  "penaltyUndo",
  "penaltyWaive",
  "cover",
];

async function audit(agentId: string, actor: string | null, action: string, detail: Record<string, string | number | boolean | null>) {
  await prisma.ruleAudit.create({ data: { agentId, actor, action, detail } });
}

/** Ids of the file's dispatchers at this outlet; new J&T IDs become new dispatchers. */
async function dispatcherIds(agentId: string, branchId: string, people: FileDispatcher[]): Promise<Map<string, string>> {
  const known = await prisma.dispatcherAssignment.findMany({ where: { branchId, extId: { in: people.map((p) => p.extId) } }, select: { extId: true, dispatcherId: true } });
  const ids = new Map(known.map((a) => [a.extId, a.dispatcherId]));
  const missing = people.filter((p) => !ids.has(p.extId));
  if (missing.length === 0) return ids;
  await prisma.$transaction(async (tx) => {
    const created = await tx.dispatcher.createManyAndReturn({
      data: missing.map((p) => ({ agentId, branchId, extId: p.extId, name: p.name, normalizedName: normalizeName(p.name) })),
      select: { id: true, extId: true },
    });
    await tx.dispatcherAssignment.createMany({ data: created.map((c) => ({ dispatcherId: c.id, branchId, extId: c.extId })) });
    for (const c of created) ids.set(c.extId, c.id);
  });
  return ids;
}

export async function createRun(input: {
  agentId: string;
  actor: string | null;
  key: string;
  fileName: string;
  rows: ParsedRow[];
}): Promise<ActionResult<{ runId: string; replaced: boolean }>> {
  const read = summariseRows(input.rows);
  if (!read.ok) return { ok: false, error: read.error };
  const { outlet: code, period, dispatchers, stats } = read.summary;
  const outlet = await ensureOutlet(input.agentId, code);
  if (!outlet.ok) return outlet;
  const branchId = outlet.data.id;

  const existing = await prisma.payrollRun.findUnique({ where: { branchId_period: { branchId, period } }, select: { id: true, status: true } });
  if (existing?.status === "FINAL") return { ok: false, error: "run.err.final", vars: { outlet: code } };

  const ids = await dispatcherIds(input.agentId, branchId, dispatchers);
  const file = {
    fileName: input.fileName.slice(0, 200),
    r2Key: input.key,
    parcelCount: dispatchers.reduce((n, d) => n + d.parcels.w.length, 0),
    stats: json(stats),
    rules: Prisma.DbNull,
    calculatedAt: null,
  };
  // A draft for the same outlet and month is replaced: it's recomputed from the file anyway.
  const runId = await prisma.$transaction(
    async (tx) => {
      const run = existing
        ? await tx.payrollRun.update({ where: { id: existing.id }, data: file, select: { id: true } })
        : await tx.payrollRun.create({ data: { ...file, agentId: input.agentId, branchId, period }, select: { id: true } });
      if (existing) await tx.payrollResult.deleteMany({ where: { runId: run.id } });
      await tx.payrollResult.createMany({
        data: dispatchers.map((d) => ({ runId: run.id, dispatcherId: ids.get(d.extId)!, extId: d.extId, name: d.name, parcels: json(d.parcels), lines: json([]) })),
      });
      return run.id;
    },
    { timeout: 60_000 },
  );
  const calculated = await calculateRun(input.agentId, runId);
  if (!calculated.ok) return calculated;
  await audit(input.agentId, input.actor, "run", { outlet: code, month: period, file: file.fileName, replaced: !!existing });
  return { ok: true, data: { runId, replaced: !!existing } };
}

/** Works out every dispatcher's pay with today's rules and profiles. Drafts only. */
export async function calculateRun(agentId: string, runId: string): Promise<ActionResult> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId },
    select: { id: true, branchId: true, period: true, status: true, branch: { select: { code: true } }, results: { select: { id: true, dispatcherId: true, parcels: true } } },
  });
  if (!run) return { ok: false, error: "error.notFound" };
  if (run.status === "FINAL") return { ok: false, error: "run.err.final", vars: { outlet: run.branch.code } };

  const dispatcherIds = run.results.map((r) => r.dispatcherId);
  const [assignments, versionRows, profileRows, penaltyRows] = await Promise.all([
    listAssignments(agentId),
    prisma.payRuleVersion.findMany({ where: { rule: { agentId, archivedAt: null } }, select: { id: true, ruleId: true, effectiveFrom: true, config: true } }),
    prisma.dispatcherProfile.findMany({ where: { dispatcherId: { in: dispatcherIds } }, select: { dispatcherId: true, effectiveFrom: true, vehicle: true, employment: true } }),
    // The month's matched cases, in the order they happened, so repeat cases escalate in order.
    prisma.penaltyItem.findMany({
      where: { agentId, period: run.period, status: "MATCHED", waived: false, dispatcherId: { in: dispatcherIds } },
      orderBy: [{ occurredAt: { sort: "asc", nulls: "last" } }, { key: "asc" }],
      select: { id: true, dispatcherId: true, type: true, waybill: true, occurredAt: true, amountCents: true, note: true },
    }),
  ]);
  const versions = new Map<string, VersionRow[]>();
  for (const v of versionRows) {
    const config = parseConfig(v.config);
    if (!config) {
      console.error(`[v2 payroll] version ${v.id} has an invalid config; skipped`);
      continue;
    }
    versions.set(v.ruleId, [...(versions.get(v.ruleId) ?? []), { id: v.id, ruleId: v.ruleId, effectiveFrom: v.effectiveFrom, config }]);
  }
  const profiles = new Map<string, Profile[]>();
  for (const { dispatcherId, ...p } of profileRows) profiles.set(dispatcherId, [...(profiles.get(dispatcherId) ?? []), p]);
  const penalties = new Map<string, PenaltyCase[]>();
  for (const { dispatcherId, occurredAt, ...p } of penaltyRows) {
    penalties.set(dispatcherId!, [...(penalties.get(dispatcherId!) ?? []), { ...p, occurredAt: occurredAt?.toISOString().slice(0, 19) ?? null }]);
  }

  // The rule versions the run used, so a finalised run keeps the rates it was paid at.
  const used: Record<string, { ruleId: string; name: string; kind: string; effectiveFrom: number; config: unknown }> = {};
  const updates = run.results.map((r) => {
    const profile = inForce(profiles.get(r.dispatcherId) ?? [], run.period);
    const cases = penalties.get(r.dispatcherId) ?? [];
    const pay = payDispatcher({
      period: run.period,
      branchId: run.branchId,
      dispatcherId: r.dispatcherId,
      parcels: r.parcels as unknown as Parcels,
      profile,
      assignments,
      versionsOf: (ruleId) => versions.get(ruleId) ?? [],
      penalties: cases,
    });
    for (const line of pay.lines) {
      const v = versions.get(line.ruleId)?.find((x) => x.id === line.versionId);
      if (v) used[v.id] = { ruleId: v.ruleId, name: line.name, kind: line.kind, effectiveFrom: v.effectiveFrom, config: v.config };
    }
    return prisma.payrollResult.update({
      where: { id: r.id },
      data: {
        profile: profile ? json(profile) : Prisma.DbNull,
        lines: json(pay.lines),
        warnings: pay.warnings.length ? json(pay.warnings) : Prisma.DbNull,
        penalties: cases.length ? json(cases) : Prisma.DbNull,
        earningsCents: pay.earningsCents,
        deductionCents: pay.deductionCents,
        netCents: pay.netCents,
      },
    });
  });
  await prisma.$transaction([...updates, prisma.payrollRun.update({ where: { id: run.id }, data: { rules: json(used), calculatedAt: new Date() } })]);
  return { ok: true, data: undefined };
}

/** True when rules or profiles changed after the run was worked out. */
export async function isStale(agentId: string, calculatedAt: Date | null): Promise<boolean> {
  if (!calculatedAt) return true;
  const changes = await prisma.ruleAudit.count({ where: { agentId, action: { in: PAY_CHANGES }, createdAt: { gt: calculatedAt } } });
  return changes > 0;
}

export async function finaliseRun(agentId: string, actor: string | null, runId: string): Promise<ActionResult> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId },
    select: {
      id: true,
      period: true,
      status: true,
      calculatedAt: true,
      penaltiesCheckedAt: true,
      branch: { select: { code: true } },
      results: { select: { warnings: true } },
    },
  });
  if (!run) return { ok: false, error: "error.notFound" };
  if (run.status === "FINAL") return { ok: false, error: "run.err.final", vars: { outlet: run.branch.code } };
  if (!run.penaltiesCheckedAt) return { ok: false, error: "run.err.penalties" };
  if (await isStale(agentId, run.calculatedAt)) return { ok: false, error: "run.err.stale" };
  const blocked = run.results.filter((r) => r.warnings !== null).length;
  if (blocked > 0) return { ok: false, error: "run.err.blocked", vars: { count: blocked } };
  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "FINAL", finalisedAt: new Date(), finalisedBy: actor } });
  await audit(agentId, actor, "finalise", { outlet: run.branch.code, month: run.period });
  return { ok: true, data: undefined };
}
