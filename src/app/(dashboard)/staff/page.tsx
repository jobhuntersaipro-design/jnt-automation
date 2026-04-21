import { prisma } from "@/lib/prisma";
import { getEmployees } from "@/lib/db/employees";
import { StaffEmployeesClient } from "@/components/staff/staff-employees-client";
import { redirect } from "next/navigation";

export default async function StaffPage() {
  const { getEffectiveAgentId } = await import("@/lib/impersonation");
  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");
  const agentId = effective.agentId;

  const [employees, allBranches] = await Promise.all([
    getEmployees(agentId, {}),
    prisma.branch.findMany({ where: { agentId }, select: { code: true }, orderBy: { code: "asc" } }),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <StaffEmployeesClient employees={employees} branchCodes={branchCodes} />
  );
}
