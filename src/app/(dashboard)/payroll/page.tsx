import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markStaleUploadsFailed } from "@/lib/db/upload";
import { getPayrollHistory } from "@/lib/db/payroll";
import { PayrollClient } from "@/components/payroll/payroll-client";

export default async function PayrollPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  const agentId = session.user.id;

  // Mark stale PROCESSING uploads as FAILED on page load
  await markStaleUploadsFailed(agentId);

  const [history, allBranches] = await Promise.all([
    getPayrollHistory(agentId),
    prisma.branch.findMany({
      where: { agentId },
      select: { code: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <PayrollClient
      initialHistory={history}
      branchCodes={branchCodes}
    />
  );
}
