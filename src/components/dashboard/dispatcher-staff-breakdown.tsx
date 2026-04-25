"use client";

import { useContainerSize } from "@/lib/hooks/use-container-size";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { RoleBreakdownPoint } from "@/lib/db/overview";
import { CHART_COLORS } from "@/lib/chart-colors";

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

interface TooltipPayload {
  payload?: RoleBreakdownPoint;
  value?: number;
  dataKey?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const total = p.dispatcher + p.staff;
  return (
    <div className="bg-white rounded-md shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 px-3 py-2 text-[0.78rem]">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      <div className="flex items-center justify-between gap-3 text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.brand }} />
          Dispatchers
        </span>
        <span className="tabular-nums">{fmtFull(p.dispatcher)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.bonusTierEarnings }} />
          Staff
        </span>
        <span className="tabular-nums">{fmtFull(p.staff)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-outline-variant/15 font-medium text-on-surface">
        <span>Total</span>
        <span className="tabular-nums">{fmtFull(total)}</span>
      </div>
    </div>
  );
}

export function DispatcherStaffBreakdown({ data }: { data: RoleBreakdownPoint[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();

  // Y-axis zoom: round up to nice step so the tallest stacked bar isn't flush with the top.
  const max = data.reduce((m, p) => Math.max(m, p.dispatcher + p.staff), 0);
  const pad = max * 0.1;
  const rawStep = (max + pad) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const yMax = max > 0 ? Math.ceil((max + pad) / step) * step : 100;

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
              Net Payout by Role
            </h2>
            <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
              Monthly dispatcher and staff salary, stacked
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:shrink-0 sm:pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.brand }} />
              <span className="text-[0.8rem] text-on-surface-variant">Dispatchers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.bonusTierEarnings }} />
              <span className="text-[0.8rem] text-on-surface-variant">Staff</span>
            </div>
          </div>
        </div>
      </div>

      <div ref={chartRef} style={{ height: "220px", width: "100%" }}>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[0.9rem]">
            No data for selected range
          </div>
        ) : cw > 0 && ch > 0 ? (
          <BarChart width={cw} height={ch} data={data} margin={{ top: 10, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              tickFormatter={fmtY}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip cursor={{ fill: CHART_COLORS.grid }} content={<CustomTooltip />} />
            <Bar dataKey="dispatcher" stackId="net" fill={CHART_COLORS.brand} radius={[0, 0, 0, 0]} />
            <Bar dataKey="staff" stackId="net" fill={CHART_COLORS.bonusTierEarnings} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : null}
      </div>
    </div>
  );
}
