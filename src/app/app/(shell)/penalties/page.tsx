import { notFound } from "next/navigation";
import { Penalties } from "@/components/v2/penalties/penalties";
import { periodFromParam, periodOf } from "@/lib/v2/pay/resolve";
import { getPenaltyMonth, listPersonOptions } from "@/lib/v2/penalties/data";
import { prisma } from "@/lib/prisma";
import { v2Session } from "@/lib/v2/session";

export default async function PenaltiesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  // Without a month asked for: the latest month with penalties, else this month.
  const latest = await prisma.penaltyItem.findFirst({ where: { agentId: s.agentId }, orderBy: { period: "desc" }, select: { period: true } });
  const period = periodFromParam((await searchParams).month) ?? latest?.period ?? periodOf(new Date());
  const [data, people] = await Promise.all([getPenaltyMonth(s.agentId, period), listPersonOptions(s.agentId)]);
  return <Penalties key={period} data={data} people={people} />;
}
