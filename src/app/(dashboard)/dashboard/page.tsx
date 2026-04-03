import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthlyNetPayoutTrend } from "@/components/dashboard/monthly-net-payout-trend";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { SalaryBreakdown } from "@/components/dashboard/salary-breakdown";
import { IncentiveHitRate } from "@/components/dashboard/incentive-hit-rate";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import {
  getSummaryStats,
  getMonthlyPayoutTrend,
  getBranchDistribution,
  getSalaryBreakdown,
  getIncentiveHitRate,
  getTopDispatchers,
  type Filters,
} from "@/lib/db/overview";
import { prisma } from "@/lib/prisma";

const fetchDashboardData = unstable_cache(
  async (agentId: string, filters: Filters) => {
    const [summary, trend, branchDist, breakdown, hitRate, dispatchers] = await Promise.all([
      getSummaryStats(agentId, filters),
      getMonthlyPayoutTrend(agentId, filters),
      getBranchDistribution(agentId, filters),
      getSalaryBreakdown(agentId, filters),
      getIncentiveHitRate(agentId, filters),
      getTopDispatchers(agentId, filters),
    ]);
    return { summary, trend, branchDist, breakdown, hitRate, dispatchers };
  },
  ["dashboard-overview"],
  { revalidate: 5 * 60 }, // 5 minutes
);

type SearchParams = {
  branches?: string;
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
};

// TODO: Replace with session.user.id once auth is set up
async function getAgentId(): Promise<string> {
  const agent = await prisma.agent.findFirst({ select: { id: true } });
  if (!agent) throw new Error("No agent found — run the seed first.");
  return agent.id;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const now = new Date();
  // Default to previous month as toMonth — current month rarely has complete data
  let defaultToMonth = now.getMonth(); // getMonth() is 0-indexed, so this is last month (1-indexed)
  let defaultToYear = now.getFullYear();
  if (defaultToMonth === 0) { defaultToMonth = 12; defaultToYear--; }
  let defaultFromMonth = defaultToMonth - 2;
  let defaultFromYear = defaultToYear;
  if (defaultFromMonth <= 0) { defaultFromMonth += 12; defaultFromYear--; }

  const selectedBranchCodes = params.branches?.split(",").filter(Boolean) ?? [];
  const fromMonth = Number(params.fromMonth ?? defaultFromMonth);
  const fromYear = Number(params.fromYear ?? defaultFromYear);
  const toMonth = Number(params.toMonth ?? defaultToMonth);
  const toYear = Number(params.toYear ?? defaultToYear);

  const filters: Filters = { selectedBranchCodes, fromMonth, fromYear, toMonth, toYear };

  const agentId = await getAgentId();

  const [{ summary, trend, branchDist, breakdown, hitRate, dispatchers }, allBranches] = await Promise.all([
    fetchDashboardData(agentId, filters),
    prisma.branch.findMany({ where: { agentId }, select: { code: true } }),
  ]);

  const branchCodes = allBranches.map((b) => b.code);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 px-8 pt-7 pb-5 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.8rem] text-on-surface tracking-tight">
              Overview
            </h1>
            <p className="text-[0.975rem] text-on-surface-variant mt-0.5">
              All-time performance and salary distribution across branches and dispatchers.
            </p>
          </div>

          <Suspense>
            <DashboardFilters branchCodes={branchCodes} />
          </Suspense>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 pb-16 space-y-6">
        <SummaryCards data={summary} filters={filters} />

        <div className="grid grid-cols-2 gap-4">
          <MonthlyNetPayoutTrend data={trend} />
          <BranchDistribution data={branchDist} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SalaryBreakdown data={breakdown} />
          <IncentiveHitRate data={hitRate} />
        </div>

        <TopDispatchers data={dispatchers} />
      </main>
    </div>
  );
}
