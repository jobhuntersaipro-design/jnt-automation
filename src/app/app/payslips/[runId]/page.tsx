import { notFound } from "next/navigation";
import { Payslips } from "@/components/v2/payslip/payslips";
import { prisma } from "@/lib/prisma";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

// Outside the app shell so the page prints as payslips only. `?d=` is one dispatcher's result.
export default async function PayslipsPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ d?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const [{ runId }, { d }] = await Promise.all([params, searchParams]);
  const [run, company] = await Promise.all([
    getRunView(s.agentId, runId),
    prisma.agent.findUnique({ where: { id: s.agentId }, select: { name: true, companyRegistrationNo: true, companyAddress: true, stampImageUrl: true } }),
  ]);
  if (!run || !company) notFound();
  const results = d ? run.results.filter((r) => r.id === d) : run.results;
  if (results.length === 0) notFound();
  return <Payslips run={run} results={results} company={company} back={`/app/payroll/${run.id}`} />;
}
