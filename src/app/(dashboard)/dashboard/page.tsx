import { Suspense } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { DispatcherStaffBreakdown } from "@/components/dashboard/dispatcher-staff-breakdown";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { PayoutPerBranch } from "@/components/dashboard/payout-per-branch";
import { BonusTierHitRate } from "@/components/dashboard/bonus-tier-hit-rate";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { OverviewExport } from "@/components/dashboard/overview-export";
import { ChartErrorBoundary } from "@/components/ui/chart-error-boundary";
import {
  fetchSummary,
  fetchTrend,
  fetchBranchDist,
  fetchPayoutByBranch,
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

/**
 * Unified loading state for the whole dashboard content area. Shown while all
 * charts fetch in parallel so the UI doesn't flicker chart-by-chart as each
 * Suspense boundary settles.
 */
function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4 lg:space-y-6"
    >
      <span className="sr-only">Loading dashboard…</span>

      <div className="rounded-[0.75rem] bg-surface-container-lowest border-l-4 border-on-surface-variant shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] p-10 flex flex-col items-center justify-center gap-4 text-center">
        <svg
          className="animate-spin h-7 w-7 text-brand"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.18"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="font-heading font-semibold text-[1.05rem] text-on-surface">
            Loading overview…
          </p>
          <p className="text-[0.85rem] text-on-surface-variant mt-0.5">
            Crunching salary records, branches, and dispatcher performance.
          </p>
        </div>
      </div>

      {/* Ghost layout below preserves vertical space so nothing jumps when
          data resolves. */}
      <ChartSkeleton heightClass="h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <ChartSkeleton heightClass="h-80" />
    </div>
  );
}

/**
 * Awaits every overview query in parallel so the page renders all sections
 * together. Wrapped in a single <Suspense> so the dashboard transitions in
 * one motion from loading → fully-rendered.
 */
async function DashboardContent({
  agentId,
  filters,
}: {
  agentId: string;
  filters: Filters;
}) {
  const [summary, trend, branchDist, payoutByBranch, hitRate, topDispatchers] =
    await Promise.all([
      fetchSummary(agentId, filters),
      fetchTrend(agentId, filters),
      fetchBranchDist(agentId, filters),
      fetchPayoutByBranch(agentId, filters),
      fetchHitRate(agentId, filters),
      fetchTopDispatchers(agentId, filters),
    ]);

  return (
    <>
      <SummaryCards data={summary} filters={filters} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartErrorBoundary>
          <DispatcherStaffBreakdown data={trend} />
        </ChartErrorBoundary>
        <ChartErrorBoundary>
          <BranchDistribution data={branchDist} />
        </ChartErrorBoundary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartErrorBoundary>
          <PayoutPerBranch
            data={payoutByBranch.data}
            branches={payoutByBranch.branches}
          />
        </ChartErrorBoundary>
        <ChartErrorBoundary>
          <BonusTierHitRate data={hitRate} />
        </ChartErrorBoundary>
      </div>

      <ChartErrorBoundary>
        <TopDispatchers
          data={topDispatchers}
          action={
            <div key="export">
              <OverviewExport />
            </div>
          }
        />
      </ChartErrorBoundary>
    </>
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

  const allBranches = await prisma.branch.findMany({
    where: { agentId },
    select: { code: true },
  });
  const branchCodes = allBranches.map((b: { code: string }) => b.code);

  return (
    <div className="flex-1 min-w-0 overflow-x-clip lg:overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-14 lg:top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-5 pb-3 lg:pb-4 bg-surface/80 backdrop-blur-md">
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
        <Suspense fallback={<DashboardLoading />}>
          <DashboardContent agentId={agentId} filters={filters} />
        </Suspense>
      </main>
    </div>
  );
}
