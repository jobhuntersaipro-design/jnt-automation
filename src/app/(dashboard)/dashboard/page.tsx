import { Suspense } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthlyNetPayoutTrend } from "@/components/dashboard/monthly-net-payout-trend";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { SalaryBreakdown } from "@/components/dashboard/salary-breakdown";
import { IncentiveHitRate } from "@/components/dashboard/incentive-hit-rate";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { OverviewExport } from "@/components/dashboard/overview-export";
import { ChartErrorBoundary } from "@/components/ui/chart-error-boundary";
import { fetchDashboardData } from "@/lib/db/overview-cached";
import type { Filters } from "@/lib/db/overview";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

  const { getEffectiveAgentId } = await import("@/lib/impersonation");
  const effective = await getEffectiveAgentId();
  const agentId = effective!.agentId;

  const [[summary, trend, branchDist, breakdown, hitRate, dispatchers], allBranches] = await Promise.all([
    fetchDashboardData(agentId, filters),
    prisma.branch.findMany({ where: { agentId }, select: { code: true } }),
  ]);

  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-5 pb-3 lg:pb-4 bg-surface/80 backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.2rem] lg:text-[1.36rem] text-on-surface tracking-tight">
              Overview
            </h1>
            <p className="text-[0.72rem] text-on-surface-variant mt-0.5 hidden sm:block">
              All-time performance and salary distribution across branches and dispatchers.
            </p>
          </div>

          <Suspense>
            <div className="flex items-center gap-2" data-tutorial="filters">
              <DashboardFilters branchCodes={branchCodes} />
            </div>
          </Suspense>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 lg:px-8 pb-16 space-y-4 lg:space-y-6">
        <div data-tutorial="summary-cards">
          <SummaryCards data={summary} filters={filters} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-tutorial="charts">
          <ChartErrorBoundary>
            <MonthlyNetPayoutTrend data={trend} />
          </ChartErrorBoundary>
          <ChartErrorBoundary>
            <BranchDistribution data={branchDist} />
          </ChartErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartErrorBoundary>
            <SalaryBreakdown data={breakdown} />
          </ChartErrorBoundary>
          <ChartErrorBoundary>
            <IncentiveHitRate data={hitRate} />
          </ChartErrorBoundary>
        </div>

        <div data-tutorial="dispatcher-table">
          <ChartErrorBoundary>
            <TopDispatchers
              data={dispatchers}
              action={
                <div key="export" data-tutorial="export">
                  <OverviewExport />
                </div>
              }
            />
          </ChartErrorBoundary>
        </div>
      </main>
    </div>
  );
}
