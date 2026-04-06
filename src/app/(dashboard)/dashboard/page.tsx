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
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type SearchParams = {
  branches?: string;
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
};

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

  const session = await auth();
  const agentId = session!.user.id;

  // Cache key includes agentId + filters so each tenant and filter combo gets its own bucket.
  // Defined inside the page function (not module scope) so agentId is available for the key.
  const fetchDashboardData = unstable_cache(
    () => Promise.all([
      getSummaryStats(agentId, filters),
      getMonthlyPayoutTrend(agentId, filters),
      getBranchDistribution(agentId, filters),
      getSalaryBreakdown(agentId, filters),
      getIncentiveHitRate(agentId, filters),
      getTopDispatchers(agentId, filters),
    ]),
    [`dashboard-overview:${agentId}:${JSON.stringify(filters)}`],
    { revalidate: 5 * 60 },
  );

  const [[summary, trend, branchDist, breakdown, hitRate, dispatchers], allBranches] = await Promise.all([
    fetchDashboardData(),
    prisma.branch.findMany({ where: { agentId }, select: { code: true } }),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 px-8 pt-5 pb-4 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.36rem] text-on-surface tracking-tight">
              Overview
            </h1>
            <p className="text-[0.72rem] text-on-surface-variant mt-0.5">
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
