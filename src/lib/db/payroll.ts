import { prisma } from "@/lib/prisma";

/**
 * Get all SAVED uploads for an agent, with dispatcher count and total net payout.
 * Used for the payroll history list.
 */
export async function getPayrollHistory(agentId: string) {
  const [uploads, sums] = await Promise.all([
    prisma.upload.findMany({
      where: { branch: { agentId }, status: "SAVED" },
      select: {
        id: true,
        month: true,
        year: true,
        branch: { select: { code: true } },
        _count: { select: { salaryRecords: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.salaryRecord.groupBy({
      by: ["uploadId"],
      where: { upload: { branch: { agentId }, status: "SAVED" } },
      _sum: {
        netSalary: true,
        baseSalary: true,
        bonusTierEarnings: true,
        petrolSubsidy: true,
        penalty: true,
        advance: true,
      },
    }),
  ]);

  const sumMap = new Map(sums.map((s) => [s.uploadId, s._sum]));

  return uploads.map((u) => {
    const s = sumMap.get(u.id);
    return {
      uploadId: u.id,
      branchCode: u.branch.code,
      month: u.month,
      year: u.year,
      dispatcherCount: u._count.salaryRecords,
      totalNetPayout: s?.netSalary ?? 0,
      totalBaseSalary: s?.baseSalary ?? 0,
      totalBonusTierEarnings: s?.bonusTierEarnings ?? 0,
      totalPetrolSubsidy: s?.petrolSubsidy ?? 0,
      totalDeductions: (s?.penalty ?? 0) + (s?.advance ?? 0),
    };
  });
}

/**
 * Get all salary records for a specific upload, with dispatcher info and upload metadata.
 * Used for the /payroll/[uploadId] salary table page.
 */
export async function getSalaryRecordsByUpload(uploadId: string, agentId: string) {
  const [upload, records] = await Promise.all([
    prisma.upload.findFirst({
      where: { id: uploadId, branch: { agentId }, status: "SAVED" },
      select: { id: true, month: true, year: true, branch: { select: { code: true } } },
    }),
    prisma.salaryRecord.findMany({
      where: { uploadId },
      include: {
        dispatcher: {
          select: { id: true, extId: true, name: true, avatarUrl: true, icNo: true },
        },
      },
      orderBy: { dispatcher: { name: "asc" } },
    }),
  ]);

  if (!upload) return null;

  const summary = {
    totalNetPayout: records.reduce((sum, r) => sum + r.netSalary, 0),
    // "Base Salary" here = default-tier + bonus-tier earnings combined.
    // Per-row table breaks these out into two sub-columns under a grouped header.
    totalBaseSalary: records.reduce(
      (sum, r) => sum + r.baseSalary + r.bonusTierEarnings,
      0,
    ),
    totalPetrolSubsidy: records.reduce((sum, r) => sum + r.petrolSubsidy, 0),
    totalCommission: records.reduce((sum, r) => sum + r.commission, 0),
    totalDeductions: records.reduce((sum, r) => sum + r.penalty + r.advance, 0),
  };

  const wasRecalculated = records.some(
    (r) => r.updatedAt.getTime() - r.createdAt.getTime() > 1000,
  );

  return {
    upload: {
      id: upload.id,
      month: upload.month,
      year: upload.year,
      branchCode: upload.branch.code,
      wasRecalculated,
    },
    records: records.map((r) => ({
      dispatcherId: r.dispatcherId,
      extId: r.dispatcher.extId,
      name: r.dispatcher.name,
      avatarUrl: r.dispatcher.avatarUrl,
      icNo: r.dispatcher.icNo,
      totalOrders: r.totalOrders,
      baseSalary: r.baseSalary,
      bonusTierEarnings: r.bonusTierEarnings,
      petrolSubsidy: r.petrolSubsidy,
      commission: r.commission,
      penalty: r.penalty,
      advance: r.advance,
      netSalary: r.netSalary,
      bonusTierSnapshot: r.bonusTierSnapshot,
    })),
    summary,
  };
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
