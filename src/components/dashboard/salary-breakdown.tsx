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
import { CHART_COLORS } from "@/lib/chart-colors";

const SEGMENTS = [
  { key: "baseSalary", label: "Base Salary", color: CHART_COLORS.brand },
  { key: "incentive", label: "Monthly Incentive", color: CHART_COLORS.incentive },
  { key: "petrolSubsidy", label: "Petrol Subsidy", color: CHART_COLORS.petrolSubsidy },
  { key: "deductions", label: "Penalty / Deductions", color: CHART_COLORS.deductions },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

function fmtShort(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  return `RM ${(n / 1_000).toFixed(0)}K`;
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
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.9rem] space-y-1">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill }} />
          <span className="text-on-surface-variant">{p.name}:</span>
          <span className="font-medium text-on-surface tabular-nums">{fmtShort(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

type BreakdownPoint = {
  month: string;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  deductions: number;
};

export function SalaryBreakdown({ data }: { data: BreakdownPoint[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();
  const [hoveredKey, setHoveredKey] = useState<SegmentKey | null>(null);

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="shrink-0">
        <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
          Salary Breakdown
        </h2>
        <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
          Monthly cost components across entire operation
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
          {SEGMENTS.map(({ key, label, color }) => (
            <div
              key={key}
              className="flex items-center gap-1.5 cursor-pointer"
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <div
                className="w-3 h-3 rounded-sm shrink-0 transition-opacity"
                style={{
                  background: color,
                  opacity: hoveredKey === null || hoveredKey === key ? 1 : 0.3,
                }}
              />
              <span
                className="text-[0.84rem] transition-colors"
                style={{
                  color: hoveredKey === null || hoveredKey === key ? CHART_COLORS.axisText : CHART_COLORS.outlineVariant,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div ref={chartRef} style={{ height: "14rem", width: "100%" }}>
        {cw > 0 && ch > 0 ? (
          <BarChart
            width={cw}
            height={ch}
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
            barSize={110}
          >
            <XAxis
              dataKey="month"
              tick={{ fontSize: 13, fill: "#424654", dy: 4 }}
              axisLine={false}
              tickLine={false}
              padding={{ left: 24, right: 24 }}
            />
            <YAxis
              tickFormatter={fmtY}
              tick={{ fontSize: 12, fill: "#424654", dx: -4 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<TooltipContent />} cursor={false} />
            {SEGMENTS.map(({ key, label, color }, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                stackId="a"
                fill={color}
                fillOpacity={hoveredKey === null || hoveredKey === key ? 1 : 0.15}
                stroke="white"
                strokeWidth={1.5}
                activeBar={{ fill: color, fillOpacity: 0.82, stroke: "white", strokeWidth: 1.5 }}
                radius={i === SEGMENTS.length - 1 ? [4, 4, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        ) : null}
      </div>
    </div>
  );
}
