import { prisma } from "@/lib/prisma";
import type { Gender } from "@/generated/prisma/client";

export type BranchOverviewCard = {
  branchCode: string;
  dispatcherCount: number;
  supervisorCount: number;
  adminCount: number;
  storeKeeperCount: number;
  /** Most recent salary record month label, e.g. "Apr 2026", or null */
  lastActive: string | null;
  /** Lifetime net payout from all salary records uploaded to this branch */
  lifetimeNetPayout: number;
};

const MONTH_LABEL = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * One card per branch for the index page. Counts dispatchers via current
 * (un-ended) DispatcherAssignment rows so transfers don't double-count.
 * Employee counts are split by EmployeeType. Lifetime net + last-active
 * derived from SalaryRecord rows joined through Upload.
 */
export async function getBranchesOverview(agentId: string): Promise<BranchOverviewCard[]> {
  const branches = await prisma.branch.findMany({
    where: { agentId },
    select: {
      code: true,
      _count: {
        select: {
          assignments: { where: { endedAt: null } },
        },
      },
      employees: { select: { type: true } },
      uploads: {
        select: {
          salaryRecords: { select: { netSalary: true, month: true, year: true } },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  return branches.map((b) => {
    let supervisorCount = 0;
    let adminCount = 0;
    let storeKeeperCount = 0;
    for (const e of b.employees) {
      if (e.type === "SUPERVISOR") supervisorCount++;
      else if (e.type === "ADMIN") adminCount++;
      else if (e.type === "STORE_KEEPER") storeKeeperCount++;
    }

    let lifetimeNetPayout = 0;
    let lastSortKey = 0;
    let lastMonth = 0;
    let lastYear = 0;
    for (const u of b.uploads) {
      for (const r of u.salaryRecords) {
        lifetimeNetPayout += r.netSalary;
        const sortKey = r.year * 12 + r.month;
        if (sortKey > lastSortKey) {
          lastSortKey = sortKey;
          lastMonth = r.month;
          lastYear = r.year;
        }
      }
    }

    return {
      branchCode: b.code,
      dispatcherCount: b._count.assignments,
      supervisorCount,
      adminCount,
      storeKeeperCount,
      lastActive: lastSortKey > 0 ? `${MONTH_LABEL[lastMonth]} ${lastYear}` : null,
      lifetimeNetPayout,
    };
  });
}

export type BranchSummary = {
  branchCode: string;
  dispatcherCount: number;
  monthCount: number;
  totals: {
    netSalary: number;
    baseSalary: number;
    bonusTier: number;
    petrolSubsidy: number;
    penalty: number;
    advance: number;
    totalOrders: number;
  };
};

export type BranchTrendPoint = {
  month: number;
  year: number;
  netSalary: number;
  totalOrders: number;
  penalty: number;
};

export type BranchDispatcherRow = {
  dispatcherId: string;
  /** Most-recent assignment extId at this branch (current or last) */
  extId: string;
  name: string;
  isCurrentlyAssigned: boolean;
  totalNetSalary: number;
  totalOrders: number;
  monthsActive: number;
  /** Most recent salary record month label (e.g. "Apr 2026") or null if none */
  lastActive: string | null;
  avatarUrl: string | null;
  gender: Gender;
};

export type BranchEmployeeRow = {
  employeeId: string;
  name: string;
  type: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";
  extId: string | null;
  /** Masked IC ("••••••••1234") for display; empty string if no IC set. */
  icNo: string;
  isComplete: boolean;
  avatarUrl: string | null;
  /** Avatar of the linked dispatcher (FK) — wins on display when set. */
  dispatcherAvatarUrl: string | null;
  gender: Gender;
};

export type BranchDetail = {
  summary: BranchSummary;
  trend: BranchTrendPoint[];
  dispatchers: BranchDispatcherRow[];
  employees: BranchEmployeeRow[];
};

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Load full branch detail for the agent's branch with the given code.
 * Returns null if the branch doesn't belong to this agent (treated as 404).
 */
export async function getBranchDetail(
  agentId: string,
  branchCode: string,
): Promise<BranchDetail | null> {
  const branch = await prisma.branch.findFirst({
    where: { agentId, code: branchCode },
    select: { id: true, code: true },
  });
  if (!branch) return null;

  const [assignments, salaryRecords, employees] = await Promise.all([
    prisma.dispatcherAssignment.findMany({
      where: { branchId: branch.id },
      select: {
        dispatcherId: true,
        extId: true,
        startedAt: true,
        endedAt: true,
        dispatcher: { select: { id: true, name: true, avatarUrl: true, gender: true } },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.salaryRecord.findMany({
      where: { upload: { branchId: branch.id } },
      select: {
        dispatcherId: true,
        month: true,
        year: true,
        netSalary: true,
        baseSalary: true,
        bonusTierEarnings: true,
        petrolSubsidy: true,
        penalty: true,
        advance: true,
        totalOrders: true,
      },
    }),
    prisma.employee.findMany({
      where: { branchId: branch.id, agentId },
      select: {
        id: true,
        name: true,
        type: true,
        extId: true,
        icNo: true,
        avatarUrl: true,
        gender: true,
        dispatcher: { select: { avatarUrl: true } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  // Per-dispatcher rollups (only dispatchers that actually have salary records here)
  const perDispatcher = new Map<
    string,
    { netSalary: number; totalOrders: number; months: Set<string>; lastKey: number }
  >();
  for (const r of salaryRecords) {
    const key = `${r.year}-${r.month}`;
    const sortKey = r.year * 12 + r.month;
    const cur = perDispatcher.get(r.dispatcherId);
    if (cur) {
      cur.netSalary += r.netSalary;
      cur.totalOrders += r.totalOrders;
      cur.months.add(key);
      if (sortKey > cur.lastKey) cur.lastKey = sortKey;
    } else {
      perDispatcher.set(r.dispatcherId, {
        netSalary: r.netSalary,
        totalOrders: r.totalOrders,
        months: new Set([key]),
        lastKey: sortKey,
      });
    }
  }

  // Dispatcher list — one row per assignment (current or historical), include
  // even ones with zero salary records yet (newly added).
  const seenDispatcherIds = new Set<string>();
  const dispatchers: BranchDispatcherRow[] = [];
  for (const a of assignments) {
    if (seenDispatcherIds.has(a.dispatcherId)) continue;
    seenDispatcherIds.add(a.dispatcherId);
    const stats = perDispatcher.get(a.dispatcherId);
    const lastMonthSortKey = stats?.lastKey ?? 0;
    const lastMonth = lastMonthSortKey > 0 ? lastMonthSortKey % 12 || 12 : 0;
    const lastYear = lastMonthSortKey > 0 ? Math.floor((lastMonthSortKey - 1) / 12) : 0;
    dispatchers.push({
      dispatcherId: a.dispatcherId,
      extId: a.extId,
      name: a.dispatcher.name,
      isCurrentlyAssigned: a.endedAt === null,
      totalNetSalary: stats?.netSalary ?? 0,
      totalOrders: stats?.totalOrders ?? 0,
      monthsActive: stats?.months.size ?? 0,
      lastActive: lastMonth > 0 ? `${MONTH_ABBR[lastMonth]} ${lastYear}` : null,
      avatarUrl: a.dispatcher.avatarUrl,
      gender: a.dispatcher.gender,
    });
  }
  dispatchers.sort((a, b) => b.totalNetSalary - a.totalNetSalary);

  // Monthly trend — aggregate salary records by month
  const monthly = new Map<
    string,
    { month: number; year: number; netSalary: number; totalOrders: number; penalty: number }
  >();
  for (const r of salaryRecords) {
    const key = `${r.year}-${r.month}`;
    const cur = monthly.get(key);
    if (cur) {
      cur.netSalary += r.netSalary;
      cur.totalOrders += r.totalOrders;
      cur.penalty += r.penalty;
    } else {
      monthly.set(key, {
        month: r.month,
        year: r.year,
        netSalary: r.netSalary,
        totalOrders: r.totalOrders,
        penalty: r.penalty,
      });
    }
  }
  const trend: BranchTrendPoint[] = [...monthly.values()].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month),
  );

  // Summary totals
  const totals = salaryRecords.reduce(
    (acc, r) => ({
      netSalary: acc.netSalary + r.netSalary,
      baseSalary: acc.baseSalary + r.baseSalary,
      bonusTier: acc.bonusTier + r.bonusTierEarnings,
      petrolSubsidy: acc.petrolSubsidy + r.petrolSubsidy,
      penalty: acc.penalty + r.penalty,
      advance: acc.advance + r.advance,
      totalOrders: acc.totalOrders + r.totalOrders,
    }),
    {
      netSalary: 0,
      baseSalary: 0,
      bonusTier: 0,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
      totalOrders: 0,
    },
  );

  const employeeRows: BranchEmployeeRow[] = employees.map((e) => ({
    employeeId: e.id,
    name: e.name,
    type: e.type as "SUPERVISOR" | "ADMIN" | "STORE_KEEPER",
    extId: e.extId,
    icNo: e.icNo ? "•".repeat(8) + e.icNo.slice(-4) : "",
    isComplete: !!e.icNo,
    avatarUrl: e.avatarUrl,
    dispatcherAvatarUrl: e.dispatcher?.avatarUrl ?? null,
    gender: e.gender,
  }));

  return {
    summary: {
      branchCode: branch.code,
      dispatcherCount: dispatchers.length,
      monthCount: monthly.size,
      totals,
    },
    trend,
    dispatchers,
    employees: employeeRows,
  };
}
