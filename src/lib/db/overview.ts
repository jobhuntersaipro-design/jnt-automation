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

// ─── Branch Distribution ──────────────────────────────────────

export type BranchPoint = {
  name: string;
  netPayout: number;
  totalOrders: number;
  dispatcherCount: number;
};

export async function getBranchDistribution(agentId: string): Promise<BranchPoint[]> {
  const branches = await prisma.branch.findMany({
    where: { agentId },
    include: {
      dispatchers: {
        include: {
          salaryRecords: {
            select: { netSalary: true, totalOrders: true },
          },
        },
      },
    },
  });

  return branches.map((branch) => {
    let netPayout = 0;
    let totalOrders = 0;
    for (const dispatcher of branch.dispatchers) {
      for (const record of dispatcher.salaryRecords) {
        netPayout += record.netSalary;
        totalOrders += record.totalOrders;
      }
    }
    return {
      name: branch.code,
      netPayout,
      totalOrders,
      dispatcherCount: branch.dispatchers.length,
    };
  });
}
