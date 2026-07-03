"use client";

import { useMemo, useState } from "react";
import { useContainerSize } from "@/lib/hooks/use-container-size";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";
import { getBranchColor } from "@/lib/branch-colors";

type BranchPayoutPoint = {
  month: string;
  yearMonth: string;
  [branchCode: string]: number | string;
};

function fmtRM(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `RM ${(n / 1_000).toFixed(0)}K`;
  return `RM ${Math.round(n)}`;
}

function fmtY(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(0)}K`;
  return `RM ${value}`;
}

function TooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; stroke?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  // Sort by value desc so the top branch is at the top of the tooltip
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const total = sorted.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.85rem] space-y-1 min-w-[10rem]">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      {sorted.map((p) => {
        const swatch = p.stroke ?? p.color ?? "#9ca3af";
        return (
          <p key={p.name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: swatch }}
            />
            <span className="text-on-surface-variant">{p.name}</span>
            <span className="font-medium text-on-surface tabular-nums ml-auto">
              {fmtRM(p.value)}
            </span>
          </p>
        );
      })}
      {sorted.length > 1 && (
        <div className="flex items-center gap-1.5 pt-1 mt-1 border-t border-outline-variant/30">
          <span className="font-semibold text-on-surface">Total</span>
          <span className="font-semibold text-on-surface tabular-nums ml-auto">
            {fmtRM(total)}
          </span>
        </div>
      )}
    </div>
  );
}

export function PayoutPerBranch({
  data,
  branches,
}: {
  data: BranchPayoutPoint[];
  branches: string[];
}) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const visibleBranches = useMemo(
    () => branches.filter((b) => !hidden.has(b)),
    [branches, hidden],
  );

  const toggle = (code: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const showAll = () => setHidden(new Set());

  const hasAnyHidden = hidden.size > 0;
  const allHidden = branches.length > 0 && visibleBranches.length === 0;

  return (
    <div className="bg-white rounded-[0.75rem] p-4 sm:p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
              Payout per Branch
            </h2>
            <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
              Monthly net payout grouped by branch. Click a legend chip to
              show or hide a branch.
            </p>
          </div>
          {hasAnyHidden && (
            <button
              type="button"
              onClick={showAll}
              className="text-[0.78rem] font-medium text-brand hover:underline shrink-0 cursor-pointer"
            >
              Show all
            </button>
          )}
        </div>

        {branches.length > 0 ? (
          <div
            role="group"
            aria-label="Toggle branches"
            className="flex flex-wrap gap-x-2 gap-y-1.5 mt-3"
          >
            {branches.map((code) => {
              const color = getBranchColor(code).hexSolid;
              const isHidden = hidden.has(code);
              const isDimmed =
                hoveredKey !== null && hoveredKey !== code && !isHidden;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={!isHidden}
                  aria-label={
                    isHidden ? `Show branch ${code}` : `Hide branch ${code}`
                  }
                  onClick={() => toggle(code)}
                  onMouseEnter={() => setHoveredKey(code)}
                  onMouseLeave={() => setHoveredKey(null)}
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-md px-2 py-1 transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 transition-opacity"
                    style={{
                      background: color,
                      opacity: isHidden ? 0.25 : isDimmed ? 0.35 : 1,
                    }}
                  />
                  <span
                    className="text-[0.84rem] tabular-nums transition-colors"
                    style={{
                      color: isHidden
                        ? CHART_COLORS.outlineVariant
                        : isDimmed
                          ? CHART_COLORS.outlineVariant
                          : CHART_COLORS.axisText,
                      textDecoration: isHidden ? "line-through" : "none",
                    }}
                  >
                    {code}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div ref={chartRef} style={{ height: "16rem", width: "100%" }}>
        {branches.length === 0 || data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[0.9rem]">
            No payout data available for this period
          </div>
        ) : allHidden ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[0.9rem]">
            All branches hidden — click a legend chip to show one.
          </div>
        ) : cw > 0 && ch > 0 ? (() => {
          const isNarrow = cw < 480;
          return (
            <LineChart
              width={cw}
              height={ch}
              data={data}
              margin={{
                top: 12,
                right: isNarrow ? 8 : 20,
                bottom: 4,
                left: 0,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.grid}
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: isNarrow ? 10 : 13, fill: "#424654", dy: 4 }}
                axisLine={false}
                tickLine={false}
                padding={{ left: isNarrow ? 8 : 16, right: isNarrow ? 8 : 16 }}
              />
              <YAxis
                tickFormatter={fmtY}
                tick={{ fontSize: isNarrow ? 10 : 12, fill: "#424654", dx: -4 }}
                axisLine={false}
                tickLine={false}
                width={isNarrow ? 44 : 72}
              />
              <Tooltip
                content={<TooltipContent />}
                cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
              />
              {visibleBranches.map((code) => {
                const color = getBranchColor(code).hexSolid;
                const dimmed = hoveredKey !== null && hoveredKey !== code;
                return (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    name={code}
                    stroke={color}
                    strokeWidth={dimmed ? 1.5 : 2.25}
                    strokeOpacity={dimmed ? 0.25 : 1}
                    dot={{
                      r: 3,
                      fill: color,
                      stroke: "white",
                      strokeWidth: 1.5,
                      fillOpacity: dimmed ? 0.25 : 1,
                    }}
                    activeDot={{
                      r: 5,
                      fill: color,
                      stroke: "white",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          );
        })() : null}
      </div>
    </div>
  );
}
