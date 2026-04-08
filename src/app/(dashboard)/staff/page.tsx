import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDispatchers } from "@/lib/db/staff";
import { StaffClient } from "@/components/staff/staff-client";

export default async function StaffPage() {
  const session = await auth();
  const agentId = session!.user.id;

  const [dispatchers, allBranches] = await Promise.all([
    getDispatchers(agentId, {}),
    prisma.branch.findMany({ where: { agentId }, select: { code: true } }),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <StaffClient dispatchers={dispatchers} branchCodes={branchCodes} />
  );
}
