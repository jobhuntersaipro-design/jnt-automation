import { notFound, redirect } from "next/navigation";
import { NewPayroll } from "@/components/v2/payroll/new-payroll";
import { prisma } from "@/lib/prisma";
import { branchPenaltyCounts } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

/** New payroll: J&T delivery file → the branch's penalties for the month (required) → review. `?run=` once the file is in. */
export default async function NewPayrollPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const runId = (await searchParams).run;
  if (!runId) {
    const cards = await prisma.payRule.count({ where: { agentId: s.agentId, kind: "PARCEL", archivedAt: null } });
    return <NewPayroll run={null} hasCard={cards > 0} />;
  }
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId: s.agentId, ...(s.member && { branchId: { in: s.member.branchIds } }) },
    select: { id: true, period: true, status: true, branch: { select: { id: true, code: true } } },
  });
  if (!run) notFound();
  if (run.status === "FINAL") redirect(`/app/payroll/${run.id}`);
  const { cases, unmatched } = await branchPenaltyCounts(s.agentId, run.period, run.branch);
  return <NewPayroll hasCard run={{ id: run.id, outlet: run.branch.code, period: run.period, cases, unmatched }} />;
}
