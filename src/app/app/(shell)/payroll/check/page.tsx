import { notFound } from "next/navigation";
import { Check } from "@/components/v2/payroll/check";
import { prisma } from "@/lib/prisma";
import { periodFromParam, periodOf } from "@/lib/v2/pay/resolve";
import { getCheckView } from "@/lib/v2/payroll/check";
import { v2Session } from "@/lib/v2/session";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  // Without a month asked for: the latest month with payroll, else this month.
  const latest = await prisma.payrollRun.findFirst({ where: { agentId: s.agentId }, orderBy: { period: "desc" }, select: { period: true } });
  const period = periodFromParam((await searchParams).month) ?? latest?.period ?? periodOf(new Date());
  return <Check key={period} view={await getCheckView(s.agentId, period)} />;
}
