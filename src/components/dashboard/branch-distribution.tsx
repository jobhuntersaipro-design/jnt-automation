"use client";

import { useState } from "react";
import { useContainerSize } from "@/lib/hooks/use-container-size";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { BranchPoint } from "@/lib/db/overview";
import { getBranchColor } from "@/lib/branch-colors";

type Metric = "netPayout" | "totalOrders";

// Extract alphabetic prefix from branch code: "KPG001" → "KPG"
function branchLabel(code: string) {
  return code;
}

function fmtValue(value: number, metric: Metric) {
  if (metric === "netPayout") {
    if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(3)}M`;
    if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}K`;
    return `RM ${value.toFixed(2)}`;
  }
  return value.toLocaleString("en-MY");
}

function fmtTick(value: number, metric: Metric) {
  if (metric === "netPayout") {
    if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `RM ${(value / 1_000).toFixed(0)}K`;
    return `RM ${value}`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(value);
}

function yDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const maxVal = Math.max(...values);
  // Tight domain starting at 0 with 15% headroom so bars fill more of the chart
  const pad = maxVal * 0.15;
  const rawStep = (maxVal + pad) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  return [0, Math.ceil((maxVal + pad) / step) * step];
}

function TooltipContent({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.9rem] space-y-0.5">
      <p className="font-semibold text-on-surface">{label}</p>
      <p className="tabular-nums font-medium text-brand">{fmtValue(payload[0].value, metric)}</p>
    </div>
  );
}

function CustomXTick({
  x,
  y,
  payload,
  data,
}: {
  x?: string | number;
  y?: string | number;
  payload?: { value: string };
  data: BranchPoint[];
}) {
  if (!payload) return null;
  const branch = data.find((b) => branchLabel(b.name) === payload.value);
  const cx = Number(x);
  const cy = Number(y);
  const iconW = 11;
  const gap = 3;
  const countStr = branch ? String(branch.dispatcherCount) : "";
  // Approximate text width at fontSize 12: ~7px per char
  const countW = countStr.length * 7;
  const rowW = iconW + gap + countW;
  return (
    <g>
      <text x={cx} y={cy} dy={14} textAnchor="middle" fill="#424654" fontSize={12}>
        {payload.value}
      </text>
      {branch && (
        <g transform={`translate(${cx - rowW / 2}, ${cy + 24})`}>
          <svg x={0} y={0} width={iconW} height={iconW} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="#424654" opacity={0.7} strokeWidth="2" />
            <path
              d="M20 21a8 8 0 0 0-16 0"
              stroke="#424654" opacity={0.7}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <text x={iconW + gap} y={iconW - 1} fill="#424654" fontSize={12} opacity={0.7} textAnchor="start">
            {countStr}
          </text>
        </g>
      )}
    </g>
  );
}

export function BranchDistribution({ data }: { data: BranchPoint[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();
  const [metric, setMetric] = useState<Metric>("netPayout");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chartData = [...data]
    .sort((a, b) => b[metric] - a[metric])
    .map((b) => ({ ...b, name: branchLabel(b.name) }));

  const domain = yDomain(chartData.map((b) => b[metric]));

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
            Branch Distribution
          </h2>
          <p className="text-[0.9rem] text-on-surface-variant mt-0.5">Performance by branch</p>
          <p className="text-[0.75rem] text-on-surface-variant/50 mt-0.5">
            All branches are always shown — not affected by the branch filter above.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-low rounded-[0.375rem] p-1 shrink-0">
          {(["netPayout", "totalOrders"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 text-[0.78rem] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                metric === m
                  ? "bg-white text-on-surface shadow-[0_1px_4px_rgba(25,28,29,0.08)]"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {m === "netPayout" ? "Net Salary" : "Total Orders"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} style={{ height: "250px", width: "100%" }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[0.9rem]">
            No branch data available
          </div>
        ) : cw > 0 && ch > 0 ? (
            <BarChart
              width={cw}
              height={Math.round(ch * 1.1)}
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 36, left: 0 }}
              barSize={64}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onMouseMove={(state: any) => {
                if (state.isTooltipActive && typeof state.activeTooltipIndex === "number") {
                  setHoveredIndex(state.activeTooltipIndex);
                } else {
                  setHoveredIndex(null);
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <XAxis
                dataKey="name"
                tick={(props) => <CustomXTick {...props} data={data} />}
                axisLine={false}
                tickLine={false}
                interval={0}
                height={52}
              />
              <YAxis
                domain={domain}
                tickFormatter={(v) => fmtTick(v, metric)}
                tick={{ fontSize: 11, fill: "#424654", dx: -4 }}
                axisLine={false}
                tickLine={false}
                width={metric === "netPayout" ? 96 : 68}
              />
              <Tooltip
                content={(props) => (
                  <TooltipContent
                    active={props.active}
                    payload={(props.payload as unknown) as Array<{ value: number }>}
                    label={props.label as string}
                    metric={metric}
                  />
                )}
                cursor={false}
              />
              <Bar
                dataKey={metric}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const { x, y, width, height, index, payload } = props;
                  if (!width || height <= 0) return <g />;
                  const opacity = hoveredIndex === null || hoveredIndex === index ? 1 : 0.2;
                  const r = 4;
                  const path = `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
                  const fill = getBranchColor(payload?.name).hexSolid;
                  return <path d={path} fill={fill} fillOpacity={opacity} />;
                }}
              />
            </BarChart>
        ) : null}
      </div>
    </div>
  );
}
