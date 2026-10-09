import { notFound, redirect } from "next/navigation";
import { NewPayroll } from "@/components/v2/payroll/new-payroll";
import { prisma } from "@/lib/prisma";
import { v2Session } from "@/lib/v2/session";

/** New payroll: J&T delivery file → the month's penalties → review. `?run=` once the file is in. */
export default async function NewPayrollPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const runId = (await searchParams).run;
  if (!runId) return <NewPayroll run={null} />;
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, agentId: s.agentId },
    select: { id: true, period: true, status: true, branch: { select: { code: true } } },
  });
  if (!run) notFound();
  if (run.status === "FINAL") redirect(`/app/payroll/${run.id}`);
  const where = { agentId: s.agentId, period: run.period };
  const [cases, unmatched] = await Promise.all([
    prisma.penaltyItem.count({ where }),
    prisma.penaltyItem.count({ where: { ...where, status: "UNMATCHED" } }),
  ]);
  return <NewPayroll run={{ id: run.id, outlet: run.branch.code, period: run.period, cases, unmatched }} />;
}
