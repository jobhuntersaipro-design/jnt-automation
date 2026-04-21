import { prisma } from "@/lib/prisma";
import { getDispatchers, getAgentDefaults } from "@/lib/db/staff";
import { markStaleUploadsFailed } from "@/lib/db/upload";
import { getPayrollHistory } from "@/lib/db/payroll";
import { DispatchersClient } from "@/components/dispatchers/dispatchers-client";
import { redirect } from "next/navigation";

export default async function DispatchersPage() {
  const { getEffectiveAgentId } = await import("@/lib/impersonation");
  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");
  const agentId = effective.agentId;

  // Mark stale PROCESSING uploads as FAILED on page load
  await markStaleUploadsFailed(agentId);

  const [dispatchers, allBranches, defaults, payrollHistory] = await Promise.all([
    getDispatchers(agentId, {}),
    prisma.branch.findMany({ where: { agentId }, select: { code: true }, orderBy: { code: "asc" } }),
    getAgentDefaults(agentId),
    getPayrollHistory(agentId),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <DispatchersClient
      dispatchers={dispatchers}
      branchCodes={branchCodes}
      defaults={defaults}
      payrollHistory={payrollHistory}
      payrollBranchCodes={branchCodes}
    />
  );
}
