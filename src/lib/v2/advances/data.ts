import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { prevPeriod, type Period } from "@/lib/v2/pay/resolve";
import { ADVANCE, type PayLine } from "@/lib/v2/payroll/calc";

export interface AdvanceView {
  id: string;
  dispatcherId: string;
  name: string;
  amountCents: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  /** A finalised run took advances from this month on, so removing it would change locked pay. */
  locked: boolean;
}

export interface Carried {
  dispatcherId: string;
  name: string;
  cents: number;
}

/** The month's advances, and what earlier months' finalised pay couldn't cover (carried into this month). */
/** `scope` narrows to some dispatchers (a branch supervisor's). */
export async function getAdvanceMonth(agentId: string, period: Period, scope: Prisma.DispatcherWhereInput = {}): Promise<{ period: Period; advances: AdvanceView[]; carried: Carried[] }> {
  const before = prevPeriod(period);
  const [rows, earlier] = await Promise.all([
    prisma.advance.findMany({ where: { agentId, period, dispatcher: scope }, orderBy: { createdAt: "asc" }, include: { dispatcher: { select: { name: true } } } }),
    prisma.advance.groupBy({ by: ["dispatcherId"], where: { agentId, period: { lte: before }, dispatcher: scope }, _sum: { amountCents: true } }),
  ]);
  // Finalised pay of everyone with advances: what it took back before this month, and whether it locks this month's.
  const taken = await prisma.payrollResult.findMany({
    where: { dispatcherId: { in: [...new Set([...rows.map((r) => r.dispatcherId), ...earlier.map((e) => e.dispatcherId)])] }, run: { agentId, status: "FINAL" } },
    select: { dispatcherId: true, lines: true, run: { select: { period: true } } },
  });
  const took = (r: (typeof taken)[number]) => (r.lines as unknown as PayLine[]).filter((l) => l.ruleId === ADVANCE).reduce((n, l) => n + l.cents, 0);
  const owed = new Map(earlier.map((g) => [g.dispatcherId, g._sum.amountCents ?? 0]));
  for (const r of taken) if (r.run.period <= before && owed.has(r.dispatcherId)) owed.set(r.dispatcherId, owed.get(r.dispatcherId)! - took(r));
  const lockedFor = new Set(taken.filter((r) => r.run.period >= period && took(r) > 0).map((r) => r.dispatcherId));
  const carriedIds = [...owed].filter(([, cents]) => cents > 0).map(([id]) => id);
  const names = new Map((await prisma.dispatcher.findMany({ where: { id: { in: carriedIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  return {
    period,
    advances: rows.map((a) => ({
      id: a.id,
      dispatcherId: a.dispatcherId,
      name: a.dispatcher.name,
      amountCents: a.amountCents,
      note: a.note,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
      locked: lockedFor.has(a.dispatcherId),
    })),
    carried: carriedIds.map((id) => ({ dispatcherId: id, name: names.get(id) ?? "", cents: owed.get(id)! })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
