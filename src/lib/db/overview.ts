import { prisma } from "@/lib/prisma";

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

// ─── Summary Stats ────────────────────────────────────────────

export type SummaryStats = {
  totalNetPayout: number;
  avgMonthlySalary: number;
  totalDispatchers: number;
  totalOrders: number;
  prev: {
    totalNetPayout: number;
    avgMonthlySalary: number;
    totalDispatchers: number;
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

  const [records, prevRecords] = await Promise.all([
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
      select: { dispatcherId: true, netSalary: true, totalOrders: true },
    }),
    prisma.salaryRecord.findMany({
      where: { ...branchWhere, OR: prevMonths.map(({ month, year }) => ({ month, year })) },
      select: { dispatcherId: true, netSalary: true, totalOrders: true },
    }),
  ]);

  const totalNetPayout = records.reduce((s, r) => s + r.netSalary, 0);
  const uniqueDispatchers = new Set(records.map((r) => r.dispatcherId)).size;
  const totalOrders = records.reduce((s, r) => s + r.totalOrders, 0);
  const avgMonthlySalary = uniqueDispatchers > 0 ? totalNetPayout / uniqueDispatchers : 0;

  const prevUniqueDispatchers = new Set(prevRecords.map((r) => r.dispatcherId)).size;
  const prevTotalOrders = prevRecords.reduce((s, r) => s + r.totalOrders, 0);
  const prevNetPayout = prevRecords.reduce((s, r) => s + r.netSalary, 0);
  const prevAvgMonthlySalary =
    prevUniqueDispatchers > 0 ? prevNetPayout / prevUniqueDispatchers : 0;

  return {
    totalNetPayout,
    avgMonthlySalary,
    totalDispatchers: uniqueDispatchers,
    totalOrders,
    prev: {
      totalNetPayout: prevNetPayout,
      avgMonthlySalary: prevAvgMonthlySalary,
      totalDispatchers: prevUniqueDispatchers,
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

// ─── Salary Breakdown ─────────────────────────────────────────

export type BreakdownPoint = {
  month: string;
  baseSalary: number;
  incentive: number;
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
      incentive: true,
      petrolSubsidy: true,
      penalty: true,
      advance: true,
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return records.map((r) => ({
    month: MONTH_ABBR[r.month - 1],
    baseSalary: r._sum.baseSalary ?? 0,
    incentive: r._sum.incentive ?? 0,
    petrolSubsidy: r._sum.petrolSubsidy ?? 0,
    deductions: (r._sum.penalty ?? 0) + (r._sum.advance ?? 0),
  }));
}

// ─── Incentive Hit Rate ───────────────────────────────────────

export type HitRatePoint = { month: string; rate: number };

export async function getIncentiveHitRate(
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
      where: { dispatcher: { branch: { agentId } } },
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
  incentive: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  netSalary: number;
};

export async function getTopDispatchers(
  agentId: string,
  filters: Filters,
): Promise<DispatcherRow[]> {
  const { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear } = filters;
  const months = buildMonthRange(fromMonth, fromYear, toMonth, toYear);
  const branchWhere = buildBranchWhere(agentId, selectedBranchCodes);

  // Aggregate and sort at the DB level; fetch only the top 20 dispatcher IDs
  const aggregated = await prisma.salaryRecord.groupBy({
    by: ["dispatcherId"],
    where: { ...branchWhere, OR: months.map(({ month, year }) => ({ month, year })) },
    _sum: { totalOrders: true, baseSalary: true, incentive: true, petrolSubsidy: true, penalty: true, advance: true, netSalary: true },
    orderBy: { _sum: { netSalary: "desc" } },
    take: 20,
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
      incentive: r._sum.incentive ?? 0,
      petrolSubsidy: r._sum.petrolSubsidy ?? 0,
      penalty: r._sum.penalty ?? 0,
      advance: r._sum.advance ?? 0,
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
  const [branches, aggregated] = await Promise.all([
    prisma.branch.findMany({
      where: { agentId },
      select: {
        code: true,
        _count: { select: { dispatchers: true } },
        dispatchers: { select: { id: true } },
      },
    }),
    prisma.salaryRecord.groupBy({
      by: ["dispatcherId"],
      where: {
        dispatcher: { branch: { agentId } },
        OR: months.map(({ month, year }) => ({ month, year })),
      },
      _sum: { netSalary: true, totalOrders: true },
    }),
  ]);

  const dispatcherTotals = new Map(
    aggregated.map((r) => [r.dispatcherId, { netSalary: r._sum.netSalary ?? 0, totalOrders: r._sum.totalOrders ?? 0 }]),
  );

  return branches.map((branch) => {
    let netPayout = 0;
    let totalOrders = 0;
    for (const { id } of branch.dispatchers) {
      const totals = dispatcherTotals.get(id);
      if (totals) { netPayout += totals.netSalary; totalOrders += totals.totalOrders; }
    }
    return { name: branch.code, netPayout, totalOrders, dispatcherCount: branch._count.dispatchers };
  });
}
