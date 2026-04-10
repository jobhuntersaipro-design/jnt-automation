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
  /** Full IC (unmasked) for the drawer */
  rawIcNo: string;
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number } | null;
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number } | null;
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
      weightTiers: {
        select: { tier: true, minWeight: true, maxWeight: true, commission: true },
        orderBy: { tier: "asc" as const },
      },
      incentiveRule: { select: { orderThreshold: true, incentiveAmount: true } },
      petrolRule: { select: { isEligible: true, dailyThreshold: true, subsidyAmount: true } },
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
    isComplete: computeIsComplete(
      d.icNo,
      d.weightTiers,
      d.incentiveRule,
      d.petrolRule,
    ),
    rawIcNo: d.icNo,
    weightTiers: d.weightTiers,
    incentiveRule: d.incentiveRule,
    petrolRule: d.petrolRule,
  }));
}

export type DispatcherDetail = {
  id: string;
  extId: string;
  name: string;
  icNo: string;
  gender: Gender;
  branchCode: string;
  isPinned: boolean;
  isComplete: boolean;
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number } | null;
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number } | null;
};

export async function getDispatcherById(
  agentId: string,
  dispatcherId: string,
): Promise<DispatcherDetail | null> {
  const d = await prisma.dispatcher.findFirst({
    where: { id: dispatcherId, branch: { agentId } },
    include: {
      branch: { select: { code: true } },
      weightTiers: {
        select: { tier: true, minWeight: true, maxWeight: true, commission: true },
        orderBy: { tier: "asc" },
      },
      incentiveRule: {
        select: { orderThreshold: true, incentiveAmount: true },
      },
      petrolRule: {
        select: { isEligible: true, dailyThreshold: true, subsidyAmount: true },
      },
    },
  });

  if (!d) return null;

  return {
    id: d.id,
    extId: d.extId,
    name: d.name,
    icNo: d.icNo,
    gender: d.gender,
    branchCode: d.branch.code,
    isPinned: d.isPinned,
    isComplete: computeIsComplete(d.icNo, d.weightTiers, d.incentiveRule, d.petrolRule),
    weightTiers: d.weightTiers,
    incentiveRule: d.incentiveRule,
    petrolRule: d.petrolRule,
  };
}

function computeIsComplete(
  icNo: string,
  weightTiers: { tier: number }[],
  incentiveRule: { incentiveAmount: number } | null,
  petrolRule: unknown,
): boolean {
  return (
    icNo.length > 0 &&
    weightTiers.length === 3 &&
    !!incentiveRule &&
    incentiveRule.incentiveAmount > 0 &&
    !!petrolRule
  );
}

function maskIc(ic: string): string {
  if (ic.length <= 4) return ic;
  return "\u2022".repeat(ic.length - 4) + ic.slice(-4);
}
