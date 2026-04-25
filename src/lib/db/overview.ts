import { prisma } from "@/lib/prisma";
import { splitNetPayout, computeAvgMonthlySalary } from "./breakdown";

export type Filters = {
  selectedBranchCodes: string[];
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
};

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

function shiftBack(months: { month: number; year: number }[]) {
  const len = months.length;
  return months.map(({ month, year }) => {
    let m = month - len;
    let y = year;
    while (m <= 0) { m += 12; y--; }
    return { month: m, year: y };
  });
}

function buildBranchWhere(agentId: string, selectedBranchCodes: string[]) {
  if (selectedBranchCodes.length > 0) {
    return { dispatcher: { branch: { agentId, code: { in: selectedBranchCodes } } } };
  }
  return { dispatcher: { branch: { agentId } } };
}

function buildEmployeeBranchWhere(agentId: string, selectedBranchCodes: string[]) {
  if (selectedBranchCodes.length > 0) {
    return {
      employee: { agentId, branch: { code: { in: selectedBranchCodes } } },
    };
  }
  return { employee: { agentId } };
}

// ─── Summary Stats ────────────────────────────────────────────

export type SummaryStats = {
  totalNetPayout: number;
  netPayoutByRole: { dispatcher: number; staff: number };
  avgMonthlySalary: { dispatcher: number; staff: number };
  totalDispatchers: number;
  totalStaff: number;
  totalOrders: number;
  prev: {
    totalNetPayout: number;
    netPayoutByRole: { dispatcher: number; staff: number };
    avgMonthlySalary: { dispatcher: number; staff: number };
    totalDispatchers: number;
    totalStaff: number;
    totalOrders: number;
  };
};

export async function getSummaryStats(
  agentId: string,
  filters: Filters,
): Promise<SummaryStats> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const prevMonths = shiftBack(months);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);
  const employeeWhere = buildEmployeeBranchWhere(agentId, selectedBranchCodes);

  const [records, prevRecords, empRecords, prevEmpRecords] = await Promise.all([
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { dispatcherId: true, netSalary: true, totalOrders: true },
    }),
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: prevMonths.map(({ month, year }) => ({ month, year })) },
      select: { dispatcherId: true, netSalary: true, totalOrders: true },
    }),
    prisma.employeeSalaryRecord.findMany({
      where: { ...employeeWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { employeeId: true, netSalary: true },
    }),
    prisma.employeeSalaryRecord.findMany({
      where: { ...employeeWhere, OR: prevMonths.map(({ month, year }) => ({ month, year })) },
      select: { employeeId: true, netSalary: true },
    }),
  ]);

  const split = splitNetPayout(records, empRecords);
  const prevSplit = splitNetPayout(prevRecords, prevEmpRecords);

  const uniqueDispatchers = new Set(records.map((r) => r.dispatcherId)).size;
  const uniqueStaff = new Set(empRecords.map((r) => r.employeeId)).size;
  const totalOrders = records.reduce((s, r) => s + r.totalOrders, 0);

  const prevUniqueDispatchers = new Set(prevRecords.map((r) => r.dispatcherId)).size;
  const prevUniqueStaff = new Set(prevEmpRecords.map((r) => r.employeeId)).size;
  const prevTotalOrders = prevRecords.reduce((s, r) => s + r.totalOrders, 0);

  const avgMonthlySalary = computeAvgMonthlySalary({
    dispatcherTotal: split.dispatcher,
    dispatcherUnique: uniqueDispatchers,
    staffTotal: split.staff,
    staffUnique: uniqueStaff,
  });
  const prevAvgMonthlySalary = computeAvgMonthlySalary({
    dispatcherTotal: prevSplit.dispatcher,
    dispatcherUnique: prevUniqueDispatchers,
    staffTotal: prevSplit.staff,
    staffUnique: prevUniqueStaff,
  });

  return {
    totalNetPayout: split.total,
    netPayoutByRole: { dispatcher: split.dispatcher, staff: split.staff },
    avgMonthlySalary,
    totalDispatchers: uniqueDispatchers,
    totalStaff: uniqueStaff,
    totalOrders,
    prev: {
      totalNetPayout: prevSplit.total,
      netPayoutByRole: { dispatcher: prevSplit.dispatcher, staff: prevSplit.staff },
      avgMonthlySalary: prevAvgMonthlySalary,
      totalDispatchers: prevUniqueDispatchers,
      totalStaff: prevUniqueStaff,
      totalOrders: prevTotalOrders,
    },
  };
}

// ─── Monthly Payout Trend ─────────────────────────────────────

export type TrendPoint = { month: string; actual: number; baseSalary: number };

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export async function getMonthlyPayoutTrend(
  agentId: string,
  filters: Filters,
): Promise<TrendPoint[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);

  const records = await prisma.salaryRecord.findMany({
    where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
    select: { month: true, year: true, netSalary: true, baseSalary: true },
  });

  // Group in-memory by year-month
  const grouped = new Map<string, { netSalary: number; baseSalary: number; month: number }>();
  for (const r of records) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const prev = grouped.get(key) ?? { netSalary: 0, baseSalary: 0, month: r.month };
    grouped.set(key, {
      netSalary: prev.netSalary + r.netSalary,
      baseSalary: prev.baseSalary + r.baseSalary,
      month: r.month,
    });
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: MONTH_ABBR[v.month - 1],
      actual: v.netSalary,
      baseSalary: v.baseSalary,
    }));
}

// ─── Net Payout by Role Trend ─────────────────────────────────

export type RoleBreakdownPoint = { month: string; dispatcher: number; staff: number };

export async function getMonthlyDispatcherStaffBreakdown(
  agentId: string,
  filters: Filters,
): Promise<RoleBreakdownPoint[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);
  const employeeWhere = buildEmployeeBranchWhere(agentId, selectedBranchCodes);

  const [dispatcherRecords, staffRecords] = await Promise.all([
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { month: true, year: true, netSalary: true },
    }),
    prisma.employeeSalaryRecord.findMany({
      where: { ...employeeWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { month: true, year: true, netSalary: true },
    }),
  ]);

  const grouped = new Map<string, { dispatcher: number; staff: number; month: number }>();
  const ensure = (key: string, month: number) =>
    grouped.get(key) ?? { dispatcher: 0, staff: 0, month };
  for (const r of dispatcherRecords) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const cur = ensure(key, r.month);
    grouped.set(key, { ...cur, dispatcher: cur.dispatcher + r.netSalary });
  }
  for (const r of staffRecords) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const cur = ensure(key, r.month);
    grouped.set(key, { ...cur, staff: cur.staff + r.netSalary });
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: MONTH_ABBR[v.month - 1],
      dispatcher: v.dispatcher,
      staff: v.staff,
    }));
}

// ─── Salary Breakdown ─────────────────────────────────────────

export type BreakdownPoint = {
  month: string;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  deductions: number;
};

export async function getSalaryBreakdown(
  agentId: string,
  filters: Filters,
): Promise<BreakdownPoint[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);

  const records = await prisma.salaryRecord.groupBy({
    by: ["month", "year"],
    where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
    _sum: {
      baseSalary: true,
      bonusTierEarnings: true,
      petrolSubsidy: true,
      penalty: true,
      advance: true,
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return records.map((r) => ({
    month: MONTH_ABBR[r.month - 1],
    baseSalary: r._sum.baseSalary ?? 0,
    bonusTierEarnings: r._sum.bonusTierEarnings ?? 0,
    petrolSubsidy: r._sum.petrolSubsidy ?? 0,
    deductions: (r._sum.penalty ?? 0) + (r._sum.advance ?? 0),
  }));
}

// ─── Bonus Tier Hit Rate ───────────────────────────────────────

export type HitRatePoint = { month: string; rate: number };

export async function getBonusTierHitRate(
  agentId: string,
  filters: Filters,
): Promise<HitRatePoint[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);

  // Fetch thresholds once (one row per dispatcher) instead of re-fetching per salary record
  const [records, thresholds] = await Promise.all([
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { month: true, year: true, totalOrders: true, dispatcherId: true },
    }),
    prisma.incentiveRule.findMany({
      where: {
        dispatcher: {
          branch: {
            agentId,
            ...(selectedBranchCodes.length > 0 && { code: { in: selectedBranchCodes } }),
          },
        },
      },
      select: { dispatcherId: true, orderThreshold: true },
    }),
  ]);

  const thresholdMap = new Map(thresholds.map((r) => [r.dispatcherId, r.orderThreshold]));

  // Group by year-month, count hits vs total
  const grouped = new Map<string, { hits: number; total: number; month: number }>();
  for (const r of records) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const prev = grouped.get(key) ?? { hits: 0, total: 0, month: r.month };
    const threshold = thresholdMap.get(r.dispatcherId) ?? Infinity;
    grouped.set(key, {
      hits: prev.hits + (r.totalOrders >= threshold ? 1 : 0),
      total: prev.total + 1,
      month: r.month,
    });
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      month: MONTH_ABBR[v.month - 1],
      rate: v.total > 0 ? (v.hits / v.total) * 100 : 0,
    }));
}

// ─── Top Dispatchers ──────────────────────────────────────────

export type DispatcherRow = {
  id: string;
  name: string;
  branch: string;
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  avatarUrl: string | null;
  totalOrders: number;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  deductions: number;
  netSalary: number;
};

export async function getTopDispatchers(
  agentId: string,
  filters: Filters,
): Promise<DispatcherRow[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);

  // Aggregate and sort at the DB level
  const aggregated = await prisma.salaryRecord.groupBy({
    by: ["dispatcherId"],
    where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
    _sum: { totalOrders: true, baseSalary: true, bonusTierEarnings: true, petrolSubsidy: true, penalty: true, advance: true, netSalary: true },
    orderBy: { _sum: { netSalary: "desc" } },
  });

  if (aggregated.length === 0) return [];

  const dispatcherIds = aggregated.map((r) => r.dispatcherId);
  const dispatcherMeta = await prisma.dispatcher.findMany({
    where: { id: { in: dispatcherIds } },
    select: { id: true, extId: true, name: true, gender: true, avatarUrl: true, branch: { select: { code: true } } },
  });

  const metaMap = new Map(dispatcherMeta.map((d) => [d.id, d]));

  return aggregated.flatMap((r) => {
    const d = metaMap.get(r.dispatcherId);
    if (!d) return [];
    return [{
      id: d.extId,
      name: d.name,
      branch: d.branch.code,
      gender: d.gender,
      avatarUrl: d.avatarUrl,
      totalOrders: r._sum.totalOrders ?? 0,
      baseSalary: r._sum.baseSalary ?? 0,
      bonusTierEarnings: r._sum.bonusTierEarnings ?? 0,
      petrolSubsidy: r._sum.petrolSubsidy ?? 0,
      penalty: r._sum.penalty ?? 0,
      advance: r._sum.advance ?? 0,
      deductions: (r._sum.penalty ?? 0) + (r._sum.advance ?? 0),
      netSalary: r._sum.netSalary ?? 0,
    }];
  });
}

// ─── Branch Distribution ──────────────────────────────────────

export type BranchPoint = {
  name: string;
  netPayout: number;
  totalOrders: number;
  dispatcherCount: number;
};

export async function getBranchDistribution(agentId: string, filters: Filters): Promise<BranchPoint[]> {
  const months = buildMonthRange(filters.fromMonth, filters.fromYear, filters.toMonth, filters.toYear);

  // Note: intentionally ignores selectedBranchCodes — always shows all branches for comparison.
  const [branches, records] = await Promise.all([
    prisma.branch.findMany({
      where: { agentId },
      select: {
        code: true,
        _count: { select: { dispatchers: true } },
      },
    }),
    prisma.salaryRecord.findMany({
      where: {
        dispatcher: { branch: { agentId } },
        OR: months.map(({ month, year }) => ({ month, year })),
      },
      select: {
        netSalary: true,
        totalOrders: true,
        dispatcher: { select: { branch: { select: { code: true } } } },
      },
    }),
  ]);

  // Aggregate salary records by branch code
  const branchTotals = new Map<string, { netPayout: number; totalOrders: number }>();
  for (const r of records) {
    const code = r.dispatcher.branch.code;
    const prev = branchTotals.get(code) ?? { netPayout: 0, totalOrders: 0 };
    branchTotals.set(code, {
      netPayout: prev.netPayout + r.netSalary,
      totalOrders: prev.totalOrders + r.totalOrders,
    });
  }

  return branches.map((branch) => {
    const totals = branchTotals.get(branch.code) ?? { netPayout: 0, totalOrders: 0 };
    return { name: branch.code, netPayout: totals.netPayout, totalOrders: totals.totalOrders, dispatcherCount: branch._count.dispatchers };
  });
}
