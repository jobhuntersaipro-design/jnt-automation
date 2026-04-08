import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";

export type StaffDispatcher = {
  id: string;
  extId: string;
  name: string;
  icNo: string;
  gender: Gender;
  avatarUrl: string | null;
  isPinned: boolean;
  branchCode: string;
  isComplete: boolean;
};

export async function getDispatchers(
  agentId: string,
  filters: { branchCodes?: string[]; search?: string },
): Promise<StaffDispatcher[]> {
  const { branchCodes = [], search } = filters;

  const dispatchers = await prisma.dispatcher.findMany({
    where: {
      branch: {
        agentId,
        ...(branchCodes.length > 0 && { code: { in: branchCodes } }),
      },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { extId: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    },
    include: {
      branch: { select: { code: true } },
      weightTiers: { select: { id: true } },
      incentiveRule: { select: { id: true } },
      petrolRule: { select: { id: true } },
    },
    orderBy: [{ isPinned: "desc" }, { name: "asc" }],
  });

  return dispatchers.map((d) => ({
    id: d.id,
    extId: d.extId,
    name: d.name,
    icNo: maskIc(d.icNo),
    gender: d.gender,
    avatarUrl: d.avatarUrl,
    isPinned: d.isPinned,
    branchCode: d.branch.code,
    isComplete: d.weightTiers.length === 3 && !!d.incentiveRule && !!d.petrolRule,
  }));
}

function maskIc(ic: string): string {
  if (ic.length <= 4) return ic;
  return "\u2022".repeat(ic.length - 4) + ic.slice(-4);
}
