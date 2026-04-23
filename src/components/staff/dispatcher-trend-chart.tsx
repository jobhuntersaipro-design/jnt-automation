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

interface TrendInputRecord {
  month: number;
  year: number;
  totalOrders: number;
  netSalary: number;
  penalty: number;
}

interface TrendPoint {
  label: string;
  sortKey: number;
  orders: number;
  net: number;
  penalty: number;
}

type ActiveLine = null | "orders" | "net" | "penalty";

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ORDERS_COLOR = CHART_COLORS.brand;
const NET_COLOR = CHART_COLORS.bonusTierEarnings;
const PENALTY_COLOR = CHART_COLORS.critical;

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

export function DispatcherTrendChart({ records }: { records: TrendInputRecord[] }) {
  const { ref: chartRef, width: cw, height: ch } = useContainerSize();
  const [activeLine, setActiveLine] = useState<ActiveLine>(null);

  const data = useMemo<TrendPoint[]>(() => {
    return [...records]
      .map((r) => ({
        label: `${MONTH_ABBR[r.month]} ${String(r.year).slice(-2)}`,
        sortKey: r.year * 12 + r.month,
        orders: r.totalOrders,
        net: r.netSalary,
        penalty: r.penalty,
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [records]);

  if (data.length < 2) {
    return (
      <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-3.5 h-3.5 text-on-surface-variant/70" />
          <h3 className="text-[0.7rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
            Performance trend
          </h3>
        </div>
        <p className="text-[0.78rem] text-on-surface-variant/70 mt-1.5">
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
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-on-surface-variant/70" />
          <h3 className="text-[0.7rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
            Performance trend
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleLine("orders")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "orders" ? 1 : 0.4 }}
            aria-label="Toggle orders line"
          >
            <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: ORDERS_COLOR }} />
            <span className="text-[0.7rem] text-on-surface-variant">Orders</span>
          </button>
          <button
            type="button"
            onClick={() => toggleLine("net")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "net" ? 1 : 0.4 }}
            aria-label="Toggle net salary line"
          >
            <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: NET_COLOR }} />
            <span className="text-[0.7rem] text-on-surface-variant">Net</span>
          </button>
          <button
            type="button"
            onClick={() => toggleLine("penalty")}
            className="flex items-center gap-1.5 transition-opacity cursor-pointer"
            style={{ opacity: activeLine === null || activeLine === "penalty" ? 1 : 0.4 }}
            aria-label="Toggle penalty line"
          >
            <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: PENALTY_COLOR }} />
            <span className="text-[0.7rem] text-on-surface-variant">Penalty</span>
          </button>
        </div>
      </div>

      <div ref={chartRef} style={{ height: "180px", width: "100%", minWidth: 0 }}>
        {cw > 0 && ch > 0 ? (
          <ComposedChart
            width={cw}
            height={ch}
            data={data}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
              axisLine={false}
              tickLine={false}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              yAxisId="orders"
              orientation="left"
              domain={[0, Math.ceil(ordersMax * 1.15)]}
              tickFormatter={fmtOrdersShort}
              tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <YAxis
              yAxisId="money"
              orientation="right"
              domain={[0, Math.ceil(moneyMax * 1.15)]}
              tickFormatter={fmtRMShort}
              tick={{ fontSize: 10, fill: CHART_COLORS.axisText }}
              axisLine={false}
              tickLine={false}
              width={50}
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
              strokeWidth={2}
              strokeOpacity={lineOpacity("orders")}
              dot={{ fill: ORDERS_COLOR, r: 3, strokeWidth: 0, fillOpacity: lineOpacity("orders") }}
              activeDot={{ r: 5, fill: ORDERS_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="net"
              name="Net Salary"
              stroke={NET_COLOR}
              strokeWidth={2}
              strokeOpacity={lineOpacity("net")}
              dot={{ fill: NET_COLOR, r: 3, strokeWidth: 0, fillOpacity: lineOpacity("net") }}
              activeDot={{ r: 5, fill: NET_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="penalty"
              name="Penalty"
              stroke={PENALTY_COLOR}
              strokeWidth={2}
              strokeOpacity={lineOpacity("penalty")}
              strokeDasharray="4 3"
              dot={{ fill: PENALTY_COLOR, r: 3, strokeWidth: 0, fillOpacity: lineOpacity("penalty") }}
              activeDot={{ r: 5, fill: PENALTY_COLOR, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        ) : null}
      </div>
    </div>
  );
}
