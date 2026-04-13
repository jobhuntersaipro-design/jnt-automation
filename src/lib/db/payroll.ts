import { prisma } from "@/lib/prisma";

/**
 * Get all SAVED uploads for an agent, with dispatcher count and total net payout.
 * Used for the payroll history list.
 */
export async function getPayrollHistory(agentId: string) {
  const uploads = await prisma.upload.findMany({
    where: {
      branch: { agentId },
      status: "SAVED",
    },
    select: {
      id: true,
      month: true,
      year: true,
      branch: {
        select: { code: true },
      },
      _count: {
        select: { salaryRecords: true },
      },
      salaryRecords: {
        select: { netSalary: true, baseSalary: true, penalty: true, advance: true },
      },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return uploads.map((u) => ({
    uploadId: u.id,
    branchCode: u.branch.code,
    month: u.month,
    year: u.year,
    dispatcherCount: u._count.salaryRecords,
    totalNetPayout: u.salaryRecords.reduce((sum, r) => sum + r.netSalary, 0),
    totalBaseSalary: u.salaryRecords.reduce((sum, r) => sum + r.baseSalary, 0),
    totalDeductions: u.salaryRecords.reduce((sum, r) => sum + r.penalty + r.advance, 0),
  }));
}

/**
 * Get the current upload state for a specific branch + month + year.
 * Returns null if no upload exists (NONE state).
 */
export async function getUploadState(
  agentId: string,
  branchCode: string,
  month: number,
  year: number,
) {
  const upload = await prisma.upload.findFirst({
    where: {
      branch: { agentId, code: branchCode },
      month,
      year,
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      fileName: true,
      month: true,
      year: true,
      updatedAt: true,
    },
  });

  return upload;
}
