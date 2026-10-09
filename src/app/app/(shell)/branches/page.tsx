import { notFound } from "next/navigation";
import { Outlets } from "@/components/v2/people/outlets";
import { prisma } from "@/lib/prisma";
import { listOutletViews } from "@/lib/v2/people/data";
import { v2Owner } from "@/lib/v2/session";

export default async function OutletsPage() {
  const s = await v2Owner();
  if (!s) notFound();
  const [outlets, everyone] = await Promise.all([
    listOutletViews(s.agentId),
    prisma.payRuleAssignment.count({ where: { agentId: s.agentId, branchId: null, dispatcherId: null, rule: { archivedAt: null } } }),
  ]);
  return <Outlets outlets={outlets} everyoneHasRules={everyone > 0} />;
}
