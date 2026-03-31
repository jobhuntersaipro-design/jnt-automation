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
import { mockMonthlyTrendFull } from "@/lib/mock-data";

function fmtY(value: number) {
  return `RM ${(value / 1_000_000).toFixed(0)}M`;
}

function fmtFull(value: number) {
  return `RM ${(value / 1_000_000).toFixed(2)}M`;
}

// Module-level — always looks up against the full dataset for correct MoM
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const current = payload[0].value;
  const idx = mockMonthlyTrendFull.findIndex((d) => d.month === label);
  const prev = idx > 0 ? mockMonthlyTrendFull[idx - 1].actual : null;
  const mom = prev !== null ? ((current - prev) / prev) * 100 : null;

  return (
    <div className="bg-white rounded-lg px-3 py-2 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] text-[0.9rem]">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      <p style={{ color: payload[0].color }}>{fmtFull(current)}</p>
      {mom !== null && (
        <p className="mt-0.5 font-medium" style={{ color: mom >= 0 ? "#10B981" : "#940002" }}>
          {mom >= 0 ? "+" : ""}{mom.toFixed(1)}% vs prev month
        </p>
      )}
    </div>
  );
}

export function MonthlyNetPayoutTrend() {
  const [view, setView] = useState<"6M" | "1Y">("1Y");

  const data = view === "6M" ? mockMonthlyTrendFull.slice(-6) : mockMonthlyTrendFull;

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-critical h-full">
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
            Monthly Net Payout Trend
          </h2>
          <p className="text-[0.9rem] text-on-surface-variant mt-0.5">
            Full-year cash flow overview
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(["6M", "1Y"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[0.825rem] font-semibold tracking-wide rounded-[0.375rem] transition-colors ${
                view === v
                  ? "bg-brand text-white"
                  : "bg-surface-low text-on-surface-variant"
              }`}
            >
              {v === "6M" ? "6 MONTHS" : "1 YEAR"}
            </button>
          ))}
        </div>
      </div>

      {/* flex-1 + min-h-0 lets the chart expand to fill all remaining card space */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
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
              tickFormatter={fmtY}
              tick={{ fontSize: 12, fill: "#424654", dx: -20 }}
              axisLine={false}
              tickLine={false}
              width={84}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="actual"
              name="ACTUAL NET PAYOUT"
              stroke="#0056D2"
              strokeWidth={2.5}
              dot={{ fill: "#0056D2", r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#0056D2", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
