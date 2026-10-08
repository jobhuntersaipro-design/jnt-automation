import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { Kind, RuleConfig } from "@/lib/v2/pay/config";
import type { Parcels } from "@/lib/v2/pay/engine";
import type { Period } from "@/lib/v2/pay/resolve";
import type { PayLine, PenaltyCase, Profile, Warning } from "./calc";
import type { FileStats } from "./file";
import { isStale } from "./run";

// Read models for the v2 payroll screens. Every query is scoped by agentId.

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

export async function listRuns(agentId: string): Promise<RunSummary[]> {
  const [runs, sums, flagged] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { agentId },
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
  /** The rule versions the run used, by version id. */
  rules: Record<string, { name: string; kind: Kind; effectiveFrom: Period; config: RuleConfig }>;
  results: ResultView[];
}

export async function getRunView(agentId: string, runId: string): Promise<RunView | null> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId },
    select: {
      id: true,
      period: true,
      status: true,
      fileName: true,
      calculatedAt: true,
      finalisedAt: true,
      finalisedBy: true,
      stats: true,
      rules: true,
      branch: { select: { code: true } },
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
