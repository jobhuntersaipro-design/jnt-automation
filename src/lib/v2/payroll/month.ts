import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/v2/pay/resolve";
import { branchPenaltyCounts } from "./data";
import { calculateRun, isStale, unconfirmedChanges } from "./run";

export type CloseStatus = "none" | "draft" | "ready" | "final";

/** Not started, draft, ready to finalise, or finalised. Ready = every check that would stop finalising has passed. */
export function closeStatus(run: { status: "DRAFT" | "FINAL"; penaltiesChecked: boolean; flagged: number; unconfirmed: number } | null): CloseStatus {
  if (!run) return "none";
  if (run.status === "FINAL") return "final";
  return run.penaltiesChecked && run.flagged === 0 && run.unconfirmed === 0 ? "ready" : "draft";
}

export interface CloseRow {
  branch: string;
  run: { id: string; fileName: string; uploadedAt: string; dispatchers: number; netCents: number; missingProfiles: number } | null;
  penaltyCases: number;
  penaltiesChecked: boolean;
  status: CloseStatus;
}

/**
 * Every branch's payroll for one month, for the month close screen. Stale drafts are worked out again first, so the
 * numbers and statuses are today's. `outlet` narrows it to one branch.
 */
export async function getMonthClose(agentId: string, period: Period, outlet: string | null): Promise<CloseRow[]> {
  const branches = await prisma.branch.findMany({
    where: { agentId, isDemo: false, ...(outlet && { code: outlet }) },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  const runSelect = { id: true, status: true, calculatedAt: true } as const;
  for (const r of await prisma.payrollRun.findMany({ where: { agentId, period, status: "DRAFT", branchId: { in: branches.map((b) => b.id) } }, select: runSelect })) {
    if (await isStale(agentId, r.calculatedAt)) await calculateRun(agentId, r.id);
  }
  const runs = await prisma.payrollRun.findMany({
    where: { agentId, period, branchId: { in: branches.map((b) => b.id) } },
    select: {
      id: true,
      branchId: true,
      status: true,
      fileName: true,
      createdAt: true,
      penaltiesCheckedAt: true,
      results: { select: { dispatcherId: true, netCents: true, warnings: true } },
    },
  });
  return Promise.all(
    branches.map(async (b) => {
      const run = runs.find((r) => r.branchId === b.id) ?? null;
      const { cases } = await branchPenaltyCounts(agentId, period, b);
      if (!run) return { branch: b.code, run: null, penaltyCases: cases, penaltiesChecked: false, status: "none" as const };
      const flagged = run.results.filter((r) => r.warnings !== null).length;
      const missingProfiles = run.results.filter((r) => Array.isArray(r.warnings) && r.warnings.some((w) => (w as { code?: string })?.code === "noProfile")).length;
      const unconfirmed = run.status === "DRAFT" ? (await unconfirmedChanges(run.results.map((r) => r.dispatcherId), period)).length : 0;
      const penaltiesChecked = run.penaltiesCheckedAt !== null || cases > 0;
      return {
        branch: b.code,
        run: {
          id: run.id,
          fileName: run.fileName,
          uploadedAt: run.createdAt.toISOString(),
          dispatchers: run.results.length,
          netCents: run.results.reduce((n, r) => n + r.netCents, 0),
          missingProfiles,
        },
        penaltyCases: cases,
        penaltiesChecked,
        status: closeStatus({ status: run.status, penaltiesChecked, flagged, unconfirmed }),
      };
    }),
  );
}
