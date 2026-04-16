import { prisma } from "@/lib/prisma";
import { getDispatchers, getAgentDefaults } from "@/lib/db/staff";
import { getEmployees } from "@/lib/db/employees";
import { StaffClient } from "@/components/staff/staff-client";

export default async function StaffPage() {
  const { getEffectiveAgentId } = await import("@/lib/impersonation");
  const effective = await getEffectiveAgentId();
  const agentId = effective!.agentId;

  const [dispatchers, allBranches, defaults, employees] = await Promise.all([
    getDispatchers(agentId, {}),
    prisma.branch.findMany({ where: { agentId }, select: { code: true } }),
    getAgentDefaults(agentId),
    getEmployees(agentId, {}),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <StaffClient dispatchers={dispatchers} branchCodes={branchCodes} defaults={defaults} employees={employees} />
  );
}
