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
    isComplete: computeIsComplete(d.name, d.icNo, d.extId),
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
    isComplete: computeIsComplete(d.name, d.icNo, d.extId),
    weightTiers: d.weightTiers,
    incentiveRule: d.incentiveRule,
    petrolRule: d.petrolRule,
  };
}

export type AgentDefaults = {
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number };
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
};

const FALLBACK_DEFAULTS: AgentDefaults = {
  weightTiers: [
    { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
    { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
    { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
  ],
  incentiveRule: { orderThreshold: 2000, incentiveAmount: 200 },
  petrolRule: { isEligible: true, dailyThreshold: 70, subsidyAmount: 15 },
};

export async function getAgentDefaults(agentId: string): Promise<AgentDefaults> {
  const d = await prisma.agentDefault.findUnique({ where: { agentId } });
  if (!d) return FALLBACK_DEFAULTS;
  return {
    weightTiers: [
      { tier: 1, minWeight: d.tier1MinWeight, maxWeight: d.tier1MaxWeight, commission: d.tier1Commission },
      { tier: 2, minWeight: d.tier2MinWeight, maxWeight: d.tier2MaxWeight, commission: d.tier2Commission },
      { tier: 3, minWeight: d.tier3MinWeight, maxWeight: null, commission: d.tier3Commission },
    ],
    incentiveRule: { orderThreshold: d.orderThreshold, incentiveAmount: d.incentiveAmount },
    petrolRule: { isEligible: d.petrolEligible, dailyThreshold: d.dailyThreshold, subsidyAmount: d.subsidyAmount },
  };
}

export function computeIsComplete(
  name: string,
  _icNo: string,
  extId: string,
): boolean {
  return name.length > 0 && extId.length > 0;
}

export function maskIc(ic: string): string {
  if (ic.length <= 4) return ic;
  return "\u2022".repeat(ic.length - 4) + ic.slice(-4);
}
