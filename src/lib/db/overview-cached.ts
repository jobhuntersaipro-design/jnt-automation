import { unstable_cache } from "next/cache";
import {
  getSummaryStats,
  getMonthlyDispatcherStaffBreakdown,
  getBranchDistribution,
  getSalaryBreakdown,
  getBonusTierHitRate,
  getTopDispatchers,
  type Filters,
} from "./overview";

const TTL = 5 * 60;

function baseKey(agentId: string, filters: Filters): string {
  return `${agentId}:${filters.fromMonth}-${filters.fromYear}:${filters.toMonth}-${filters.toYear}:${[...filters.selectedBranchCodes].sort().join(",")}`;
}

/**
 * Per-chart cached fetchers. Each chart can await its own query inside its
 * own <Suspense> boundary so the dashboard streams as data becomes ready
 * rather than blocking on all 6 queries at once.
 */
export function fetchSummary(agentId: string, filters: Filters) {
  // v2 — schema changed to include netPayoutByRole + avgMonthlySalary split.
  const key = `overview:summary:v2:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getSummaryStats(agentId, filters), [key], { revalidate: TTL })();
}

export function fetchTrend(agentId: string, filters: Filters) {
  const key = `overview:role-breakdown:${baseKey(agentId, filters)}`;
  return unstable_cache(
    () => getMonthlyDispatcherStaffBreakdown(agentId, filters),
    [key],
    { revalidate: TTL },
  )();
}

export function fetchBranchDist(agentId: string, filters: Filters) {
  const key = `overview:branch:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getBranchDistribution(agentId, filters), [key], { revalidate: TTL })();
}

export function fetchBreakdown(agentId: string, filters: Filters) {
  const key = `overview:breakdown:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getSalaryBreakdown(agentId, filters), [key], { revalidate: TTL })();
}

export function fetchHitRate(agentId: string, filters: Filters) {
  const key = `overview:hitrate:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getBonusTierHitRate(agentId, filters), [key], { revalidate: TTL })();
}

export function fetchTopDispatchers(agentId: string, filters: Filters) {
  const key = `overview:top:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getTopDispatchers(agentId, filters), [key], { revalidate: TTL })();
}

/**
 * Batched fetcher — retained for any callers that want all six at once.
 * Prefer the individual fetchers so the dashboard can stream.
 */
export function fetchDashboardData(agentId: string, filters: Filters) {
  return Promise.all([
    fetchSummary(agentId, filters),
    fetchTrend(agentId, filters),
    fetchBranchDist(agentId, filters),
    fetchBreakdown(agentId, filters),
    fetchHitRate(agentId, filters),
    fetchTopDispatchers(agentId, filters),
  ]);
}
