import { unstable_cache } from "next/cache";
import {
  getSummaryStats,
  getMonthlyPayoutTrend,
  getBranchDistribution,
  getSalaryBreakdown,
  getBonusTierHitRate,
  getTopDispatchers,
  type Filters,
} from "./overview";

/**
 * Fetch all dashboard overview data with a 5-minute cache.
 * Cache key is stable: sorted filter keys prevent JSON ordering issues.
 */
export function fetchDashboardData(agentId: string, filters: Filters) {
  const stableKey = `dashboard-overview:${agentId}:${filters.fromMonth}-${filters.fromYear}:${filters.toMonth}-${filters.toYear}:${[...filters.selectedBranchCodes].sort().join(",")}`;

  return unstable_cache(
    () =>
      Promise.all([
        getSummaryStats(agentId, filters),
        getMonthlyPayoutTrend(agentId, filters),
        getBranchDistribution(agentId, filters),
        getSalaryBreakdown(agentId, filters),
        getBonusTierHitRate(agentId, filters),
        getTopDispatchers(agentId, filters),
      ]),
    [stableKey],
    { revalidate: 5 * 60 },
  )();
}
