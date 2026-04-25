"use client";

import { useContainerSize } from "@/lib/hooks/use-container-size";
import {
  LineChart,
  Line,
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
  return (
    <div className="bg-white rounded-md shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 px-3 py-2 text-[0.78rem]">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      <div className="flex items-center justify-between gap-3 text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS.brand }} />
          Dispatchers
        </span>
        <span className="tabular-nums">{fmtFull(p.dispatcher)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS.bonusTierEarnings }} />
          Staff
        </span>
        <span className="tabular-nums">{fmtFull(p.staff)}</span>
      </div>
    </div>
  );
}

function computeNiceMax(values: number[]): number {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max === 0) return 100;
  const pad = max * 0.1;
  const rawStep = (max + pad) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  return Math.ceil((max + pad) / step) * step;
}

export function DispatcherStaffBreakdown({ data }: { data: RoleBreakdownPoint[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();

  // Dual-axis: dispatcher on left (brand), staff on right (emerald). Each axis
  // zoomed to its own data so low-volume staff doesn't vanish against high
  // dispatcher totals. The visual cost is that the two lines cannot be
  // compared by eye — the tooltip remains the source of truth for absolute RM.
  const yMaxDispatcher = computeNiceMax(data.map((d) => d.dispatcher));
  const yMaxStaff = computeNiceMax(data.map((d) => d.staff));

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
              Net Payout by Role
            </h2>
            <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
              Dispatcher (left axis) vs Staff (right axis)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:shrink-0 sm:pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS.brand }} />
              <span className="text-[0.8rem] text-on-surface-variant">Dispatchers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS.bonusTierEarnings }} />
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
          <LineChart width={cw} height={ch} data={data} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
              axisLine={{ stroke: CHART_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              yAxisId="dispatcher"
              orientation="left"
              domain={[0, yMaxDispatcher]}
              tick={{ fill: CHART_COLORS.brand, fontSize: 11 }}
              tickFormatter={fmtY}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <YAxis
              yAxisId="staff"
              orientation="right"
              domain={[0, yMaxStaff]}
              tick={{ fill: CHART_COLORS.bonusTierEarnings, fontSize: 11 }}
              tickFormatter={fmtY}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              yAxisId="dispatcher"
              type="monotone"
              dataKey="dispatcher"
              stroke={CHART_COLORS.brand}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.brand }}
              activeDot={{ r: 5 }}
            />
            <Line
              yAxisId="staff"
              type="monotone"
              dataKey="staff"
              stroke={CHART_COLORS.bonusTierEarnings}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.bonusTierEarnings }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        ) : null}
      </div>
    </div>
  );
}
