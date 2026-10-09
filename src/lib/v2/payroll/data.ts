import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Kind, RuleConfig } from "@/lib/v2/pay/config";
import type { Parcels } from "@/lib/v2/pay/engine";
import type { Period } from "@/lib/v2/pay/resolve";
import type { PayLine, PenaltyCase, Profile, Warning } from "./calc";
import type { FileStats } from "./file";
import { isStale, unconfirmedChanges, type ProfileChange } from "./run";

// Read models for the v2 payroll screens. Every query is scoped by agentId.

/** The month of the payroll worked on most recently: where the month pickers start. */
export async function lastWorkedPeriod(agentId: string): Promise<Period | null> {
  const run = await prisma.payrollRun.findFirst({ where: { agentId }, orderBy: { updatedAt: "desc" }, select: { period: true } });
  return run?.period ?? null;
}

export interface RunSummary {
  id: string;
  outlet: string;
  period: Period;
  status: "DRAFT" | "FINAL";
  dispatchers: number;
  parcels: number;
  netCents: number;
  attention: number;
}

/** `branchIds` limits to some branches (a branch supervisor's). */
export async function listRuns(agentId: string, branchIds?: string[]): Promise<RunSummary[]> {
  const [runs, sums, flagged] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { agentId, ...(branchIds && { branchId: { in: branchIds } }) },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      select: { id: true, period: true, status: true, parcelCount: true, branch: { select: { code: true } }, _count: { select: { results: true } } },
    }),
    prisma.payrollResult.groupBy({ by: ["runId"], where: { run: { agentId } }, _sum: { netCents: true } }),
    prisma.payrollResult.groupBy({ by: ["runId"], where: { run: { agentId }, warnings: { not: Prisma.DbNull } }, _count: { _all: true } }),
  ]);
  const net = new Map(sums.map((s) => [s.runId, s._sum.netCents ?? 0]));
  const attention = new Map(flagged.map((f) => [f.runId, f._count._all]));
  return runs.map((r) => ({
    id: r.id,
    outlet: r.branch.code,
    period: r.period,
    status: r.status,
    dispatchers: r._count.results,
    parcels: r.parcelCount,
    netCents: net.get(r.id) ?? 0,
    attention: attention.get(r.id) ?? 0,
  }));
}

export interface ResultView {
  id: string;
  dispatcherId: string;
  name: string;
  extId: string;
  parcels: number;
  profile: Profile | null;
  lines: PayLine[];
  warnings: Warning[];
  /** The penalty cases deducted, as they were when calculated. */
  penalties: PenaltyCase[];
  earningsCents: number;
  deductionCents: number;
  netCents: number;
}

export interface RunView {
  id: string;
  outlet: string;
  period: Period;
  status: "DRAFT" | "FINAL";
  fileName: string;
  calculatedAt: string | null;
  finalisedAt: string | null;
  finalisedBy: string | null;
  stats: FileStats | null;
  /** A draft whose rules or profiles changed after it was worked out. */
  stale: boolean;
  /** The branch's penalties for the month are in: confirmed in New payroll, or cases for the branch were imported. */
  penaltiesChecked: boolean;
  /** Vehicle/type changes from last month still waiting for someone to confirm them (drafts only). */
  profileChanges: ProfileChange[];
  /** The rule versions the run used, by version id. */
  rules: Record<string, { name: string; kind: Kind; effectiveFrom: Period; config: RuleConfig }>;
  results: ResultView[];
}

/** Null when the run isn't the account's, or not in `branchIds` when given (a branch supervisor's). */
export async function getRunView(agentId: string, runId: string, branchIds?: string[]): Promise<RunView | null> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId, ...(branchIds && { branchId: { in: branchIds } }) },
    select: {
      id: true,
      period: true,
      status: true,
      fileName: true,
      calculatedAt: true,
      finalisedAt: true,
      finalisedBy: true,
      penaltiesCheckedAt: true,
      stats: true,
      rules: true,
      branch: { select: { id: true, code: true } },
      results: { orderBy: [{ name: "asc" }, { extId: "asc" }] },
    },
  });
  if (!run) return null;
  return {
    id: run.id,
    outlet: run.branch.code,
    period: run.period,
    status: run.status,
    fileName: run.fileName,
    calculatedAt: run.calculatedAt?.toISOString() ?? null,
    finalisedAt: run.finalisedAt?.toISOString() ?? null,
    finalisedBy: run.finalisedBy,
    stats: run.stats as FileStats | null,
    stale: run.status === "DRAFT" && (await isStale(agentId, run.calculatedAt)),
    penaltiesChecked: run.penaltiesCheckedAt !== null || (await branchPenaltyCounts(agentId, run.period, run.branch)).cases > 0,
    profileChanges: run.status === "DRAFT" ? await unconfirmedChanges(run.results.map((r) => r.dispatcherId), run.period) : [],
    rules: (run.rules ?? {}) as RunView["rules"],
    results: run.results.map((r) => ({
      id: r.id,
      dispatcherId: r.dispatcherId,
      name: r.name,
      extId: r.extId,
      parcels: (r.parcels as unknown as Parcels).w.length,
      profile: r.profile as Profile | null,
      lines: r.lines as unknown as PayLine[],
      warnings: (r.warnings ?? []) as unknown as Warning[],
      penalties: (r.penalties ?? []) as unknown as PenaltyCase[],
      earningsCents: r.earningsCents,
      deductionCents: r.deductionCents,
      netCents: r.netCents,
    })),
  };
}

/** A month's penalty cases for one branch: the file names the branch, or the case is matched to someone working there. */
export async function branchPenaltyCounts(agentId: string, period: Period, branch: { id: string; code: string }) {
  const where = {
    agentId,
    period,
    OR: [{ outlet: branch.code }, { dispatcher: { assignments: { some: { branchId: branch.id } } } }],
  };
  const [cases, unmatched] = await Promise.all([
    prisma.penaltyItem.count({ where }),
    prisma.penaltyItem.count({ where: { ...where, status: "UNMATCHED" } }),
  ]);
  return { cases, unmatched };
}
