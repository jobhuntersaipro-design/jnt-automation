"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-colors";

type HitRatePoint = { month: string; rate: number };

function TooltipContent({
  active,
  payload,
  label,
  data,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
  data: HitRatePoint[];
}) {
  if (!active || !payload?.length) return null;
  const current = payload[0].value;
  const idx = data.findIndex((d) => d.month === label);
  const prev = idx > 0 ? data[idx - 1].rate : null;
  const mom = prev !== null ? current - prev : null;

  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.9rem]">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      <p style={{ color: CHART_COLORS.brand }}>{current.toFixed(1)}%</p>
      {mom !== null && (
        <p className="mt-0.5 font-medium" style={{ color: mom >= 0 ? CHART_COLORS.success : CHART_COLORS.critical }}>
          {mom >= 0 ? "+" : ""}{mom.toFixed(1)}% vs prev month
        </p>
      )}
    </div>
  );
}

export function IncentiveHitRate({ data }: { data: HitRatePoint[] }) {
  const latest = data[data.length - 1];
  const prev = data.length >= 2 ? data[data.length - 2].rate : null;
  const delta = prev !== null && latest ? latest.rate - prev : null;

  const rates = data.map((d) => d.rate);
  const minRate = rates.length > 0 ? Math.min(...rates) : 0;
  const maxRate = rates.length > 0 ? Math.max(...rates) : 100;
  const pad = Math.max((maxRate - minRate) * 0.35, 1.5);
  const yMin = Math.floor(minRate - pad);
  const yMax = Math.ceil(maxRate + pad);

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant h-full">
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
            Incentive Hit Rate
          </h2>
          <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
            % of dispatchers reaching ≥2,000 monthly orders
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className="font-heading font-bold text-brand tabular-nums leading-none"
            style={{ fontSize: "2.4rem", letterSpacing: "-0.02em" }}
          >
            {latest ? `${latest.rate.toFixed(1)}%` : "—"}
          </p>
          {delta !== null && (
            <p
              className="text-[0.9rem] font-medium mt-0.5"
              style={{ color: delta >= 0 ? CHART_COLORS.success : CHART_COLORS.critical }}
            >
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% vs prev month
            </p>
          )}
        </div>
      </div>

      <div style={{ height: "14rem" }}>
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
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 12, fill: "#424654", dx: -15 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip content={<TooltipContent data={data} />} />
            <Line
              type="monotone"
              dataKey="rate"
              name="INCENTIVE HIT RATE"
              stroke={CHART_COLORS.brand}
              strokeWidth={2.5}
              dot={{ fill: CHART_COLORS.brand, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: CHART_COLORS.brand, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
