import { notFound } from "next/navigation";
import { RunReview } from "@/components/v2/payroll/run-review";
import { prisma } from "@/lib/prisma";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const run = await getRunView(s.agentId, (await params).runId);
  if (!run) notFound();
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
  return <RunReview run={run} uncovered={covering === 0} />;
}
