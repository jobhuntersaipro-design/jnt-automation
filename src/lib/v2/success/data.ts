import { prisma } from "@/lib/prisma";
import type { Period } from "@/lib/v2/pay/resolve";
import type { V2Session } from "@/lib/v2/session";

export interface SuccessRateView {
  id: string;
  extId: string;
  name: string | null;
  outlet: string | null;
  rateBp: number;
  delivered: number | null;
  total: number | null;
  /** The report it came from; null = typed in. */
  fileName: string | null;
  actor: string | null;
  updatedAt: string;
  /** The dispatcher with this J&T ID, if any. */
  dispatcher: { id: string; name: string } | null;
}

/** A J&T ID someone can be given a rate under: one per dispatcher and branch. */
export interface IdOption {
  extId: string;
  name: string;
  outlet: string;
}

export interface SuccessMonth {
  period: Period;
  rates: SuccessRateView[];
  /** People in the month's payroll with no rate yet (by the J&T ID in their run). */
  missing: IdOption[];
  ids: IdOption[];
}

/** The J&T IDs this session may see: every one of the account's, or a supervisor's branches'. */
export async function idOptions(s: Pick<V2Session, "agentId" | "member">): Promise<IdOption[]> {
  const rows = await prisma.dispatcherAssignment.findMany({
    where: { branch: { agentId: s.agentId, isDemo: false, ...(s.member && { id: { in: s.member.branchIds } }) } },
    select: { extId: true, branch: { select: { code: true } }, dispatcher: { select: { name: true } } },
    orderBy: { extId: "asc" },
  });
  return rows.map((r) => ({ extId: r.extId, name: r.dispatcher.name, outlet: r.branch.code }));
}

export async function getSuccessMonth(s: Pick<V2Session, "agentId" | "member">, period: Period): Promise<SuccessMonth> {
  const ids = await idOptions(s);
  const mine = new Set(ids.map((i) => i.extId));
  const [rows, people, inRuns] = await Promise.all([
    prisma.successRate.findMany({ where: { agentId: s.agentId, period }, orderBy: { extId: "asc" } }),
    prisma.dispatcherAssignment.findMany({ where: { branch: { agentId: s.agentId } }, select: { extId: true, dispatcher: { select: { id: true, name: true } } } }),
    prisma.payrollResult.findMany({
      where: { run: { agentId: s.agentId, period, ...(s.member && { branchId: { in: s.member.branchIds } }) } },
      select: { extId: true, name: true, run: { select: { branch: { select: { code: true } } } } },
      orderBy: { extId: "asc" },
    }),
  ]);
  const who = new Map(people.map((p) => [p.extId, p.dispatcher]));
  // A supervisor sees their branches' IDs only; the owner sees every row, matched or not.
  const shown = s.member ? rows.filter((r) => mine.has(r.extId)) : rows;
  const rated = new Set(rows.map((r) => r.extId));
  return {
    period,
    rates: shown.map((r) => ({
      id: r.id,
      extId: r.extId,
      name: r.name,
      outlet: r.outlet,
      rateBp: r.rateBp,
      delivered: r.delivered,
      total: r.total,
      fileName: r.fileName,
      actor: r.actor,
      updatedAt: r.updatedAt.toISOString(),
      dispatcher: who.get(r.extId) ?? null,
    })),
    missing: inRuns.filter((r) => !rated.has(r.extId)).map((r) => ({ extId: r.extId, name: r.name, outlet: r.run.branch.code })),
    ids,
  };
}
