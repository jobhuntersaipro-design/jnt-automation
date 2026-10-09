import { notFound } from "next/navigation";
import { RunReview } from "@/components/v2/payroll/run-review";
import { prisma } from "@/lib/prisma";
import { getRunView } from "@/lib/v2/payroll/data";
import { calculateRun } from "@/lib/v2/payroll/run";
import { v2Session } from "@/lib/v2/session";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const { runId } = await params;
  let run = await getRunView(s.agentId, runId, s.member?.branchIds);
  if (!run) notFound();
  // A draft is always shown with today's rules: work it out again when something changed since.
  if (run.stale && (await calculateRun(s.agentId, runId)).ok) run = (await getRunView(s.agentId, runId, s.member?.branchIds)) ?? run;
  // "No rate card covers the month": nothing with rates by then applies to everyone or to this outlet. The run's
  // warnings can't say so while vehicles are unset, so it's asked here. FT/PT-only and per-dispatcher cards don't count.
  const covering =
    run.status === "DRAFT"
      ? await prisma.payRuleAssignment.count({
          where: {
            agentId: s.agentId,
            kind: "PARCEL",
            dispatcherId: null,
            effectiveFrom: { lte: run.period },
            OR: [{ branchId: null, employment: null }, { branch: { code: run.outlet } }],
            rule: { archivedAt: null, versions: { some: { effectiveFrom: { lte: run.period } } } },
          },
        })
      : 1;
  const hasCard = covering > 0 || (await prisma.payRule.count({ where: { agentId: s.agentId, kind: "PARCEL", archivedAt: null } })) > 0;
  return <RunReview run={run} uncovered={covering === 0} hasCard={hasCard} owner={!s.member} />;
}
