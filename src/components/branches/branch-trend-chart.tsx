"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useContainerSize } from "@/lib/hooks/use-container-size";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { BranchTrendPoint } from "@/lib/db/branches";

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ORDERS_COLOR = CHART_COLORS.brand;
const NET_COLOR = CHART_COLORS.bonusTierEarnings;
const PENALTY_COLOR = CHART_COLORS.critical;

type ActiveLine = null | "orders" | "net" | "penalty";

function fmtRMShort(value: number) {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(0)}K`;
  return `RM ${value.toFixed(0)}`;
}

function fmtRMFull(value: number) {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtOrdersShort(value: number) {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const orders = payload.find((p) => p.dataKey === "orders");
  const net = payload.find((p) => p.dataKey === "net");
  const penalty = payload.find((p) => p.dataKey === "penalty");
  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.78rem] space-y-1 border border-outline-variant/20">
      <p className="font-semibold text-on-surface">{label}</p>
      {orders && (
        <p style={{ color: ORDERS_COLOR }}>
          Orders: <span className="tabular-nums font-medium">{orders.value.toLocaleString()}</span>
        </p>
      )}
      {net && (
        <p style={{ color: NET_COLOR }}>
          Net: <span className="tabular-nums font-medium">{fmtRMFull(net.value)}</span>
        </p>
      )}
      {penalty && (
        <p style={{ color: PENALTY_COLOR }}>
          Penalty: <span className="tabular-nums font-medium">{fmtRMFull(penalty.value)}</span>
        </p>
      )}
    </div>
  );
}

export function BranchTrendChart({ trend }: { trend: BranchTrendPoint[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();
  const [activeLine, setActiveLine] = useState<ActiveLine>(null);

  const data = useMemo(() => {
    return trend.map((p) => ({
      label: `${MONTH_ABBR[p.month]} ${String(p.year).slice(-2)}`,
      orders: p.totalOrders,
      net: p.netSalary,
      penalty: p.penalty,
    }));
  }, [trend]);

  if (data.length < 2) {
    return (
      <div className="bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-on-surface-variant/70" />
          <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">
            Monthly trend
          </h2>
        </div>
        <p className="text-[0.85rem] text-on-surface-variant mt-2">
          Need at least 2 months of salary data to show a trend.
        </p>
      </div>
    );
  }

  const ordersMax = Math.max(...data.map((d) => d.orders), 1);
  const moneyMax = Math.max(...data.map((d) => Math.max(d.net, d.penalty)), 1);

  function toggleLine(key: "orders" | "net" | "penalty") {
    setActiveLine((prev) => (prev === key ? null : key));
  }

  function lineOpacity(key: "orders" | "net" | "penalty") {
    if (activeLine === null) return 1;
    return activeLine === key ? 1 : 0.18;
  }

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
            Monthly trend
          </h2>
          <p className="text-[0.875rem] text-on-surface-variant mt-0.5">
            Orders, net salary and penalties at this branch
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 pt-1">
          <button
            type="button"
            onClick={() => toggleLine("orders")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "orders" ? 1 : 0.4 }}
          >
            <span className="w-6 h-0.5 rounded-full" style={{ backgroundColor: ORDERS_COLOR }} />
            <span className="text-[0.8rem] text-on-surface-variant">Orders</span>
          </button>
          <button
            type="button"
            onClick={() => toggleLine("net")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "net" ? 1 : 0.4 }}
          >
            <span className="w-6 h-0.5 rounded-full" style={{ backgroundColor: NET_COLOR }} />
            <span className="text-[0.8rem] text-on-surface-variant">Net</span>
          </button>
          <button
            type="button"
            onClick={() => toggleLine("penalty")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "penalty" ? 1 : 0.4 }}
          >
            <span className="w-6 h-0.5 rounded-full" style={{ backgroundColor: PENALTY_COLOR }} />
            <span className="text-[0.8rem] text-on-surface-variant">Penalty</span>
          </button>
        </div>
      </div>

      <div ref={chartRef} style={{ height: "240px", width: "100%", minWidth: 0 }}>
        {cw > 0 && ch > 0 ? (
          <ComposedChart
            width={cw}
            height={ch}
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: CHART_COLORS.axisText, dy: 4 }}
              axisLine={false}
              tickLine={false}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              yAxisId="orders"
              orientation="left"
              domain={[0, Math.ceil(ordersMax * 1.15)]}
              tickFormatter={fmtOrdersShort}
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <YAxis
              yAxisId="money"
              orientation="right"
              domain={[0, Math.ceil(moneyMax * 1.15)]}
              tickFormatter={fmtRMShort}
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              content={(props) => (
                <CustomTooltip
                  active={props.active}
                  payload={(props.payload as unknown) as Array<{ dataKey: string; value: number }>}
                  label={props.label as string}
                />
              )}
              cursor={{ stroke: CHART_COLORS.outlineVariant, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              name="Orders"
              stroke={ORDERS_COLOR}
              strokeWidth={2.5}
              strokeOpacity={lineOpacity("orders")}
              dot={{ fill: ORDERS_COLOR, r: 4, strokeWidth: 0, fillOpacity: lineOpacity("orders") }}
              activeDot={{ r: 6, fill: ORDERS_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="net"
              name="Net Salary"
              stroke={NET_COLOR}
              strokeWidth={2.5}
              strokeOpacity={lineOpacity("net")}
              dot={{ fill: NET_COLOR, r: 4, strokeWidth: 0, fillOpacity: lineOpacity("net") }}
              activeDot={{ r: 6, fill: NET_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="penalty"
              name="Penalty"
              stroke={PENALTY_COLOR}
              strokeWidth={2.5}
              strokeOpacity={lineOpacity("penalty")}
              strokeDasharray="4 3"
              dot={{ fill: PENALTY_COLOR, r: 4, strokeWidth: 0, fillOpacity: lineOpacity("penalty") }}
              activeDot={{ r: 6, fill: PENALTY_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : null}
      </div>
    </div>
  );
}
