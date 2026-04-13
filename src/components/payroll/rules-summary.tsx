"use client";

import type { RulesSummaryRow, Change } from "@/lib/payroll/snapshot";
import type { WeightTierInput } from "@/lib/upload/calculator";

interface RulesSummaryProps {
  branchCode: string;
  month: number;
  year: number;
  rows: RulesSummaryRow[];
  hasPreviousData: boolean;
  allTiers: Record<string, WeightTierInput[]>;
}

function formatRM(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

function formatWeight(w: number | null): string {
  if (w == null) return "∞";
  return `${w}kg`;
}

function ChangeIndicator({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <span className="text-on-surface-variant/50">&mdash;</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {changes.map((c, i) => {
        if (c.type === "NEW") {
          return (
            <span key={i} className="text-[0.72rem] font-medium text-blue-600">
              New
            </span>
          );
        }

        const fromStr = typeof c.from === "boolean"
          ? (c.from ? "Yes" : "No")
          : typeof c.from === "number"
            ? (c.label?.includes("eligibility") ? (c.from ? "Yes" : "No") : formatRM(c.from))
            : String(c.from);

        return (
          <span key={i} className="text-[0.72rem] text-amber-700">
            ⚠ {c.label} was {fromStr}
          </span>
        );
      })}
    </div>
  );
}

/** Build a key from weight tier ranges (not commissions) for grouping */
function tierRangeKey(tiers: WeightTierInput[]): string {
  return tiers
    .sort((a, b) => a.tier - b.tier)
    .map((t) => `${t.minWeight}-${t.maxWeight ?? "∞"}`)
    .join("|");
}

interface TierGroup {
  rangeKey: string;
  tiers: WeightTierInput[]; // representative tiers for the header
  dispatchers: {
    row: RulesSummaryRow;
    tiers: WeightTierInput[];
  }[];
}

function groupByTierRanges(
  rows: RulesSummaryRow[],
  allTiers: Record<string, WeightTierInput[]>,
): TierGroup[] {
  const groups = new Map<string, TierGroup>();

  for (const row of rows) {
    const tiers = allTiers[row.dispatcherId] ?? [];
    const key = tierRangeKey(tiers);

    if (!groups.has(key)) {
      groups.set(key, { rangeKey: key, tiers, dispatchers: [] });
    }
    groups.get(key)!.dispatchers.push({ row, tiers });
  }

  return [...groups.values()];
}

export function RulesSummary({
  branchCode,
  month,
  year,
  rows,
  hasPreviousData,
  allTiers,
}: RulesSummaryProps) {
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
  const groups = groupByTierRanges(rows, allTiers);

  return (
    <div className="rounded-lg bg-surface-card border border-outline-variant/15 overflow-hidden">
      <div className="px-6 py-5">
        <h3 className="text-[1rem] font-semibold text-on-surface">
          Staff Settings &mdash; {branchCode}, {monthName} {year}
        </h3>
        <p className="text-[0.82rem] text-on-surface-variant mt-1">
          Review salary rules that will be applied this month.
          {hasPreviousData
            ? " Changes from last month are highlighted."
            : " No previous data — this is the first month."}
        </p>
      </div>

      <div className="px-6 pb-5 space-y-4">
        {groups.map((group) => {
          const t1 = group.tiers.find((t) => t.tier === 1);
          const t2 = group.tiers.find((t) => t.tier === 2);
          const t3 = group.tiers.find((t) => t.tier === 3);

          return (
            <div key={group.rangeKey} className="rounded-md border border-outline-variant/10 overflow-hidden">
              {/* Tier range header */}
              <div className="px-4 py-2 bg-surface-container-low flex items-center gap-3 text-[0.72rem] uppercase tracking-wider font-medium text-on-surface-variant">
                {t1 && <span>T1 ({formatWeight(t1.minWeight)}–{formatWeight(t1.maxWeight)})</span>}
                {t2 && (
                  <>
                    <span className="text-outline-variant">·</span>
                    <span>T2 ({formatWeight(t2.minWeight)}–{formatWeight(t2.maxWeight)})</span>
                  </>
                )}
                {t3 && (
                  <>
                    <span className="text-outline-variant">·</span>
                    <span>T3 (≥{formatWeight(t3.minWeight)})</span>
                  </>
                )}
              </div>

              {/* Dispatchers in this group */}
              <table className="w-full text-[0.82rem]">
                <thead>
                  <tr className="text-left text-[0.68rem] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/10">
                    <th className="py-1.5 pl-4 pr-2 font-medium">Dispatcher</th>
                    <th className="py-1.5 px-2 font-medium">T1</th>
                    <th className="py-1.5 px-2 font-medium">T2</th>
                    <th className="py-1.5 px-2 font-medium">T3</th>
                    <th className="py-1.5 px-2 font-medium">Incentive</th>
                    <th className="py-1.5 px-2 font-medium">Petrol</th>
                    {hasPreviousData && <th className="py-1.5 pl-2 pr-4 font-medium">Changes</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.dispatchers.map(({ row, tiers }) => (
                    <tr
                      key={row.dispatcherId}
                      className="border-b border-outline-variant/6 last:border-b-0 hover:bg-surface-container-high/40 transition-colors"
                    >
                      <td className="py-2 pl-4 pr-2">
                        <span className="font-medium text-on-surface">{row.name}</span>
                        <span className="text-on-surface-variant/50 ml-1 text-[0.72rem]">{row.extId}</span>
                      </td>
                      {[1, 2, 3].map((tierNum) => {
                        const tier = tiers.find((t) => t.tier === tierNum);
                        const tierChange = row.changes.find(
                          (c) => c.type === "TIER_CHANGED" && c.tier === tierNum,
                        );
                        return (
                          <td
                            key={tierNum}
                            className={`py-2 px-2 tabular-nums ${tierChange ? "text-amber-700 font-medium" : "text-on-surface-variant"}`}
                          >
                            {tier ? formatRM(tier.commission) : "—"}
                            {tierChange && (
                              <span className="text-[0.68rem] text-amber-600 ml-0.5">
                                (was {formatRM(tierChange.from as number)})
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 tabular-nums text-on-surface">
                        {formatRM(row.incentiveAmount)}
                      </td>
                      <td className="py-2 px-2">
                        {row.petrolEligible ? (
                          <span className="text-on-surface tabular-nums text-[0.78rem]">
                            {formatRM(row.petrolAmount)}/d
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      {hasPreviousData && (
                        <td className="py-2 pl-2 pr-4">
                          <ChangeIndicator changes={row.changes} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
