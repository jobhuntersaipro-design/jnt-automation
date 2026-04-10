"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TrendPoint } from "@/lib/db/overview";
import { CHART_COLORS } from "@/lib/chart-colors";

type ActiveLine = null | "actual" | "baseSalary";

function fmtY(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(0)}K`;
  return `RM ${value}`;
}

function fmtFull(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(3)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}K`;
  return `RM ${value.toFixed(2)}`;
}

function CustomTooltip({
  active,
  payload,
  label,
  activeLine,
  data,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  activeLine: ActiveLine;
  data: TrendPoint[];
}) {
  if (!active || !payload?.length) return null;
  const idx = data.findIndex((d) => d.month === label);
  const netItem = payload.find((p) => p.dataKey === "actual");
  const baseItem = payload.find((p) => p.dataKey === "baseSalary");

  const showNet = activeLine === null || activeLine === "actual";
  const showBase = activeLine === null || activeLine === "baseSalary";

  const prevNet = idx > 0 ? data[idx - 1].actual : null;
  const prevBase = idx > 0 ? data[idx - 1].baseSalary : null;
  const momNet =
    prevNet !== null && netItem ? ((netItem.value - prevNet) / prevNet) * 100 : null;
  const momBase =
    prevBase !== null && baseItem ? ((baseItem.value - prevBase) / prevBase) * 100 : null;

  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.9rem] space-y-1.5">
      <p className="font-semibold text-on-surface">{label}</p>
      {showNet && netItem && (
        <div>
          <p style={{ color: CHART_COLORS.brand }}>Net: {fmtFull(netItem.value)}</p>
          {momNet !== null && (
            <p
              className="text-[0.8rem] font-medium"
              style={{ color: momNet >= 0 ? CHART_COLORS.success : CHART_COLORS.critical }}
            >
              {momNet >= 0 ? "+" : ""}{momNet.toFixed(1)}% vs prev month
            </p>
          )}
        </div>
      )}
      {showBase && baseItem && (
        <div className={showNet && netItem ? "border-t border-outline-variant/20 pt-1.5" : ""}>
          <p style={{ color: CHART_COLORS.baseSalaryLine }}>Base: {fmtFull(baseItem.value)}</p>
          {momBase !== null && (
            <p
              className="text-[0.8rem] font-medium"
              style={{ color: momBase >= 0 ? CHART_COLORS.success : CHART_COLORS.critical }}
            >
              {momBase >= 0 ? "+" : ""}{momBase.toFixed(1)}% vs prev month
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MonthlyNetPayoutTrend({ data }: { data: TrendPoint[] }) {
  const [activeLine, setActiveLine] = useState<ActiveLine>(null);

  const allValues = data.flatMap((d) => [d.actual, d.baseSalary]);
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;
  const range = maxVal - minVal || maxVal;
  const pad = range * 0.25;
  // Dynamic step: ~4-6 ticks regardless of data magnitude
  const rawStep = (range + pad * 2) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const yMin = Math.floor((minVal - pad) / step) * step;
  const yMax = Math.ceil((maxVal + pad) / step) * step;

  function toggleLine(key: "actual" | "baseSalary") {
    setActiveLine((prev) => (prev === key ? null : key));
  }

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
              Net Payout vs Base Salary
            </h2>
            <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
              Monthly comparison across the operation
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0 pt-1">
            <button
              onClick={() => toggleLine("actual")}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: activeLine === null || activeLine === "actual" ? 1 : 0.35 }}
            >
              <div className="w-6 h-0.5 rounded-full bg-brand" />
              <span className="text-[0.8rem] text-on-surface-variant">Net Payout</span>
            </button>
            <button
              onClick={() => toggleLine("baseSalary")}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: activeLine === null || activeLine === "baseSalary" ? 1 : 0.35 }}
            >
              <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS.baseSalaryLine }} />
              <span className="text-[0.8rem] text-on-surface-variant">Base Salary</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: "220px" }}>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[0.9rem]">
            No data for selected range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#f3f4f5" strokeWidth={1} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 13, fill: "#424654", dy: 4 }}
                axisLine={false}
                tickLine={false}
                padding={{ left: 12, right: 12 }}
              />
              <YAxis
                domain={[yMin, yMax]}
                tickFormatter={fmtY}
                tick={{ fontSize: 12, fill: "#424654", dx: -24 }}
                axisLine={false}
                tickLine={false}
                width={104}
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={
                      (props.payload as unknown) as Array<{ dataKey: string; value: number }>
                    }
                    label={props.label as string}
                    activeLine={activeLine}
                    data={data}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Net Payout"
                stroke={CHART_COLORS.brand}
                strokeWidth={2.5}
                strokeOpacity={activeLine === null || activeLine === "actual" ? 1 : 0.2}
                dot={{
                  fill: CHART_COLORS.brand,
                  r: 4,
                  strokeWidth: 0,
                  fillOpacity: activeLine === null || activeLine === "actual" ? 1 : 0.2,
                  cursor: "pointer",
                }}
                activeDot={{ r: 6, fill: CHART_COLORS.brand, strokeWidth: 0, cursor: "pointer" }}
                onClick={() => toggleLine("actual")}
                style={{ cursor: "pointer" }}
              />
              <Line
                type="monotone"
                dataKey="baseSalary"
                name="Base Salary"
                stroke={CHART_COLORS.baseSalaryLine}
                strokeWidth={2.5}
                strokeOpacity={activeLine === null || activeLine === "baseSalary" ? 1 : 0.2}
                dot={{
                  fill: CHART_COLORS.baseSalaryLine,
                  r: 4,
                  strokeWidth: 0,
                  fillOpacity: activeLine === null || activeLine === "baseSalary" ? 1 : 0.2,
                  cursor: "pointer",
                }}
                activeDot={{ r: 6, fill: CHART_COLORS.baseSalaryLine, strokeWidth: 0, cursor: "pointer" }}
                onClick={() => toggleLine("baseSalary")}
                style={{ cursor: "pointer" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
