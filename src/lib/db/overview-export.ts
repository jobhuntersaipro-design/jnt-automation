import { prisma } from "@/lib/prisma";
import type { Filters } from "./overview";

type WeightTierSnapshot = {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
};

type IncentiveSnapshot = {
  orderThreshold: number;
  incentiveAmount: number;
};

type PetrolSnapshot = {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
};

export interface DispatcherExportRow {
  name: string;
  month: string; // e.g. "Jan 2026"
  branch: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  netSalary: number;
  // Settings from snapshots
  t1Range: string;
  t1Rate: number;
  t2Range: string;
  t2Rate: number;
  t3Range: string;
  t3Rate: number;
  incentiveThreshold: number;
  incentiveAmount: number;
  petrolEligible: boolean;
  petrolThreshold: number;
  petrolAmount: number;
}

export interface BranchExportRow {
  branch: string;
  month: string;
  dispatcherCount: number;
  totalOrders: number;
  totalNetPayout: number;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildMonthRange(
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
) {
  const months: { month: number; year: number }[] = [];
  let m = fromMonth;
  let y = fromYear;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    months.push({ month: m, year: y });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function formatTierRange(minWeight: number, maxWeight: number | null): string {
  if (maxWeight === null) return `${minWeight}kg+`;
  return `${minWeight}–${maxWeight}kg`;
}

/**
 * Fetch dispatcher performance data with salary record snapshots.
 * One row per dispatcher per month — uses snapshots so settings reflect
 * what was applied that month.
 */
export async function getDispatcherExportData(
  agentId: string,
  filters: Filters,
): Promise<DispatcherExportRow[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);

  const branchFilter = selectedBranchCodes.length > 0
    ? { dispatcher: { branch: { agentId, code: { in: selectedBranchCodes } } } }
    : { dispatcher: { branch: { agentId } } };

  const records = await prisma.salaryRecord.findMany({
    where: {
      ...branchFilter,
      OR: months.map(({ month, year }) => ({ month, year })),
    },
    select: {
      month: true,
      year: true,
      totalOrders: true,
      baseSalary: true,
      incentive: true,
      petrolSubsidy: true,
      penalty: true,
      advance: true,
      netSalary: true,
      weightTiersSnapshot: true,
      incentiveSnapshot: true,
      petrolSnapshot: true,
      dispatcher: {
        select: {
          name: true,
          branch: { select: { code: true } },
        },
      },
    },
    orderBy: [
      { dispatcher: { name: "asc" } },
      { year: "asc" },
      { month: "asc" },
    ],
  });

  return records.map((r) => {
    const tiers = (r.weightTiersSnapshot as WeightTierSnapshot[] | null) ?? [];
    const incSnap = (r.incentiveSnapshot as IncentiveSnapshot | null) ?? {
      orderThreshold: 0,
      incentiveAmount: 0,
    };
    const petSnap = (r.petrolSnapshot as PetrolSnapshot | null) ?? {
      isEligible: false,
      dailyThreshold: 0,
      subsidyAmount: 0,
    };

    const t1 = tiers.find((t) => t.tier === 1);
    const t2 = tiers.find((t) => t.tier === 2);
    const t3 = tiers.find((t) => t.tier === 3);

    return {
      name: r.dispatcher.name,
      month: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
      branch: r.dispatcher.branch.code,
      totalOrders: r.totalOrders,
      baseSalary: r.baseSalary,
      incentive: r.incentive,
      petrolSubsidy: r.petrolSubsidy,
      penalty: r.penalty,
      advance: r.advance,
      netSalary: r.netSalary,
      t1Range: t1 ? formatTierRange(t1.minWeight, t1.maxWeight) : "",
      t1Rate: t1?.commission ?? 0,
      t2Range: t2 ? formatTierRange(t2.minWeight, t2.maxWeight) : "",
      t2Rate: t2?.commission ?? 0,
      t3Range: t3 ? formatTierRange(t3.minWeight, t3.maxWeight) : "",
      t3Rate: t3?.commission ?? 0,
      incentiveThreshold: incSnap.orderThreshold,
      incentiveAmount: incSnap.incentiveAmount,
      petrolEligible: petSnap.isEligible,
      petrolThreshold: petSnap.dailyThreshold,
      petrolAmount: petSnap.subsidyAmount,
    };
  });
}

/**
 * Fetch branch-level aggregated data for export.
 */
export async function getBranchExportData(
  agentId: string,
  filters: Filters,
): Promise<BranchExportRow[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);

  const branchFilter = selectedBranchCodes.length > 0
    ? { dispatcher: { branch: { agentId, code: { in: selectedBranchCodes } } } }
    : { dispatcher: { branch: { agentId } } };

  const records = await prisma.salaryRecord.findMany({
    where: {
      ...branchFilter,
      OR: months.map(({ month, year }) => ({ month, year })),
    },
    select: {
      month: true,
      year: true,
      totalOrders: true,
      netSalary: true,
      dispatcherId: true,
      dispatcher: {
        select: { branch: { select: { code: true } } },
      },
    },
  });

  // Group by branch + month
  const grouped = new Map<string, BranchExportRow & { dispatchers: Set<string> }>();
  for (const r of records) {
    const key = `${r.dispatcher.branch.code}-${r.year}-${r.month}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalOrders += r.totalOrders;
      existing.totalNetPayout += r.netSalary;
      existing.dispatchers.add(r.dispatcherId);
      existing.dispatcherCount = existing.dispatchers.size;
    } else {
      grouped.set(key, {
        branch: r.dispatcher.branch.code,
        month: `${MONTH_NAMES[r.month - 1]} ${r.year}`,
        dispatcherCount: 1,
        totalOrders: r.totalOrders,
        totalNetPayout: r.netSalary,
        dispatchers: new Set([r.dispatcherId]),
      });
    }
  }

  return [...grouped.values()]
    .sort((a, b) => a.branch.localeCompare(b.branch) || a.month.localeCompare(b.month))
    .map(({ dispatchers: _, ...row }) => row);
}
