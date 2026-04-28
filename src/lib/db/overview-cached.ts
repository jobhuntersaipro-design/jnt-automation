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
  // v3 — totalDispatchers/totalStaff switched to point-in-time counts from
  // Dispatcher/Employee source tables (was unique-per-period from salary
  // records). Bump so stale v2 entries aren't served.
  const key = `overview:summary:v3:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getSummaryStats(agentId, filters), [key], { revalidate: TTL, tags: ["overview"] })();
}

export function fetchTrend(agentId: string, filters: Filters) {
  const key = `overview:role-breakdown:${baseKey(agentId, filters)}`;
  return unstable_cache(
    () => getMonthlyDispatcherStaffBreakdown(agentId, filters),
    [key],
    { revalidate: TTL, tags: ["overview"] },
  )();
}

export function fetchBranchDist(agentId: string, filters: Filters) {
  // v2 — BranchPoint.dispatcherCount renamed to peopleCount and now
  // includes active staff (deduped via Employee.dispatcherId).
  const key = `overview:branch:v2:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getBranchDistribution(agentId, filters), [key], { revalidate: TTL, tags: ["overview"] })();
}

export function fetchBreakdown(agentId: string, filters: Filters) {
  const key = `overview:breakdown:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getSalaryBreakdown(agentId, filters), [key], { revalidate: TTL, tags: ["overview"] })();
}

export function fetchHitRate(agentId: string, filters: Filters) {
  const key = `overview:hitrate:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getBonusTierHitRate(agentId, filters), [key], { revalidate: TTL, tags: ["overview"] })();
}

export function fetchTopDispatchers(agentId: string, filters: Filters) {
  const key = `overview:top:${baseKey(agentId, filters)}`;
  return unstable_cache(() => getTopDispatchers(agentId, filters), [key], { revalidate: TTL, tags: ["overview"] })();
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
