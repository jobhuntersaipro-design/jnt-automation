"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { RulesSummaryRow, Change } from "@/lib/payroll/snapshot";
import type { WeightTierInput } from "@/lib/upload/calculator";

interface RulesSummaryProps {
  branchCode: string;
  month: number;
  year: number;
  rows: RulesSummaryRow[];
  hasPreviousData: boolean;
  allTiers: Record<string, WeightTierInput[]>;
  onProceed: () => void;
}

function formatRM(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

function ChangeIndicator({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <span className="text-on-surface-variant/50">&mdash;</span>;

  return (
    <div className="flex flex-col gap-0.5">
      {changes.map((c, i) => {
        if (c.type === "NEW") {
          return (
            <span key={i} className="text-[0.75rem] font-medium text-blue-600">
              🆕 New
            </span>
          );
        }

        const fromStr = typeof c.from === "boolean"
          ? (c.from ? "Yes" : "No")
          : typeof c.from === "number"
            ? (c.label?.includes("eligibility") ? (c.from ? "Yes" : "No") : formatRM(c.from))
            : String(c.from);

        return (
          <span key={i} className="text-[0.75rem] text-amber-700">
            ⚠ {c.label} was {fromStr}
          </span>
        );
      })}
    </div>
  );
}

function TiersPopover({
  allTiers,
  rows,
}: {
  allTiers: Record<string, WeightTierInput[]>;
  rows: RulesSummaryRow[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[0.82rem] font-medium text-brand hover:text-brand/80 transition-colors"
      >
        View Tiers
      </button>
    );
  }

  return (
    <div className="w-full mt-3 rounded-md border border-outline-variant/20 bg-surface-container-low overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-container-low">
        <span className="text-[0.78rem] font-semibold text-on-surface uppercase tracking-wider">
          Weight Tiers
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-[0.78rem] text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <table className="w-full text-[0.8rem]">
          <thead>
            <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant">
              <th className="py-1.5 pr-3 font-medium">Dispatcher</th>
              <th className="py-1.5 px-3 font-medium">Tier 1</th>
              <th className="py-1.5 px-3 font-medium">Tier 2</th>
              <th className="py-1.5 px-3 font-medium">Tier 3</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tiers = allTiers[row.dispatcherId] ?? [];
              return (
                <tr key={row.dispatcherId} className="border-t border-outline-variant/10">
                  <td className="py-1.5 pr-3 text-on-surface font-medium">{row.name}</td>
                  {[1, 2, 3].map((tierNum) => {
                    const tier = tiers.find((t) => t.tier === tierNum);
                    const tierChange = row.changes.find(
                      (c) => c.type === "TIER_CHANGED" && c.tier === tierNum,
                    );
                    return (
                      <td
                        key={tierNum}
                        className={`py-1.5 px-3 tabular-nums ${tierChange ? "text-amber-700 font-medium" : "text-on-surface-variant"}`}
                      >
                        {tier ? formatRM(tier.commission) : "—"}
                        {tierChange && (
                          <span className="text-[0.7rem] text-amber-600 ml-1">
                            (was {formatRM(tierChange.from as number)})
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RulesSummary({
  branchCode,
  month,
  year,
  rows,
  hasPreviousData,
  allTiers,
  onProceed,
}: RulesSummaryProps) {
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  return (
    <div className="rounded-lg bg-surface-card border border-outline-variant/15 overflow-hidden">
      <div className="px-6 py-5">
        <h3 className="text-[1rem] font-semibold text-on-surface">
          Rules Summary &mdash; {branchCode}, {monthName} {year}
        </h3>
        <p className="text-[0.82rem] text-on-surface-variant mt-1">
          Review salary rules that will be applied this month.
          {hasPreviousData
            ? " Changes from last month are highlighted."
            : " No previous data — this is the first month."}
        </p>
      </div>

      <div className="px-6 pb-4 overflow-x-auto">
        <table className="w-full text-[0.82rem]">
          <thead>
            <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/15">
              <th className="pb-2 pr-4 font-medium">Dispatcher</th>
              <th className="pb-2 px-4 font-medium">Incentive</th>
              <th className="pb-2 px-4 font-medium">Petrol</th>
              {hasPreviousData && (
                <th className="pb-2 pl-4 font-medium">Changes</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.dispatcherId}
                className="border-b border-outline-variant/8 last:border-b-0 hover:bg-surface-container-high/50 transition-colors"
              >
                <td className="py-2.5 pr-4">
                  <span className="font-medium text-on-surface">{row.name}</span>
                  <span className="text-on-surface-variant/60 ml-1.5 text-[0.75rem]">
                    {row.extId}
                  </span>
                </td>
                <td className="py-2.5 px-4 tabular-nums text-on-surface">
                  {formatRM(row.incentiveAmount)}
                </td>
                <td className="py-2.5 px-4">
                  {row.petrolEligible ? (
                    <span className="text-on-surface tabular-nums">
                      ✅ {formatRM(row.petrolAmount)}/day
                    </span>
                  ) : (
                    <span className="text-on-surface-variant/50">❌</span>
                  )}
                </td>
                {hasPreviousData && (
                  <td className="py-2.5 pl-4">
                    <ChangeIndicator changes={row.changes} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 pb-5 flex items-center justify-between">
        <TiersPopover allTiers={allTiers} rows={rows} />
        <button
          onClick={onProceed}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.85rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors"
        >
          Proceed to Preview →
        </button>
      </div>
    </div>
  );
}
