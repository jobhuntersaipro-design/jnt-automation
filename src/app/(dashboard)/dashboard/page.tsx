import { Suspense } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthlyNetPayoutTrend } from "@/components/dashboard/monthly-net-payout-trend";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { SalaryBreakdown } from "@/components/dashboard/salary-breakdown";
import { BonusTierHitRate } from "@/components/dashboard/bonus-tier-hit-rate";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { OverviewExport } from "@/components/dashboard/overview-export";
import { ChartErrorBoundary } from "@/components/ui/chart-error-boundary";
import {
  fetchSummary,
  fetchTrend,
  fetchBranchDist,
  fetchBreakdown,
  fetchHitRate,
  fetchTopDispatchers,
} from "@/lib/db/overview-cached";
import type { Filters } from "@/lib/db/overview";
import { prisma } from "@/lib/prisma";

type SearchParams = {
  branches?: string;
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
};

/** Skeleton block sized like a chart card — keeps layout stable while streaming. */
function ChartSkeleton({ heightClass = "h-72" }: { heightClass?: string }) {
  return (
    <div
      className={`rounded-xl bg-surface-container-lowest border border-outline-variant/15 ${heightClass} animate-pulse`}
    />
  );
}

async function SummaryCardsAsync({
  agentId,
  filters,
}: {
  agentId: string;
  filters: Filters;
}) {
  const data = await fetchSummary(agentId, filters);
  return <SummaryCards data={data} filters={filters} />;
}

async function TrendChart({ agentId, filters }: { agentId: string; filters: Filters }) {
  const data = await fetchTrend(agentId, filters);
  return <MonthlyNetPayoutTrend data={data} />;
}

async function BranchDistChart({ agentId, filters }: { agentId: string; filters: Filters }) {
  const data = await fetchBranchDist(agentId, filters);
  return <BranchDistribution data={data} />;
}

async function BreakdownChart({ agentId, filters }: { agentId: string; filters: Filters }) {
  const data = await fetchBreakdown(agentId, filters);
  return <SalaryBreakdown data={data} />;
}

async function HitRateChart({ agentId, filters }: { agentId: string; filters: Filters }) {
  const data = await fetchHitRate(agentId, filters);
  return <BonusTierHitRate data={data} />;
}

async function TopDispatchersTable({
  agentId,
  filters,
}: {
  agentId: string;
  filters: Filters;
}) {
  const data = await fetchTopDispatchers(agentId, filters);
  return (
    <TopDispatchers
      data={data}
      action={
        <div key="export">
          <OverviewExport />
        </div>
      }
    />
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const now = new Date();
  let defaultToMonth = now.getMonth();
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

  // Only the branch codes for the filter UI are awaited up-front — everything
  // else streams inside its own Suspense boundary so slow charts don't block
  // fast ones (or the header).
  const allBranches = await prisma.branch.findMany({
    where: { agentId },
    select: { code: true },
  });
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
            <div className="flex items-center gap-2">
              <DashboardFilters branchCodes={branchCodes} />
            </div>
          </Suspense>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 lg:px-8 pb-16 space-y-4 lg:space-y-6">
        <Suspense fallback={<ChartSkeleton heightClass="h-32" />}>
          <SummaryCardsAsync agentId={agentId} filters={filters} />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartErrorBoundary>
            <Suspense fallback={<ChartSkeleton />}>
              <TrendChart agentId={agentId} filters={filters} />
            </Suspense>
          </ChartErrorBoundary>
          <ChartErrorBoundary>
            <Suspense fallback={<ChartSkeleton />}>
              <BranchDistChart agentId={agentId} filters={filters} />
            </Suspense>
          </ChartErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartErrorBoundary>
            <Suspense fallback={<ChartSkeleton />}>
              <BreakdownChart agentId={agentId} filters={filters} />
            </Suspense>
          </ChartErrorBoundary>
          <ChartErrorBoundary>
            <Suspense fallback={<ChartSkeleton />}>
              <HitRateChart agentId={agentId} filters={filters} />
            </Suspense>
          </ChartErrorBoundary>
        </div>

        <div>
          <ChartErrorBoundary>
            <Suspense fallback={<ChartSkeleton heightClass="h-80" />}>
              <TopDispatchersTable agentId={agentId} filters={filters} />
            </Suspense>
          </ChartErrorBoundary>
        </div>
      </main>
    </div>
  );
}
