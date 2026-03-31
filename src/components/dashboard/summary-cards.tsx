/* eslint-disable @typescript-eslint/no-unused-vars */
import { mockSummary, mockPrevSummary } from "@/lib/mock-data";
import { TrendingUp, TrendingDown } from "lucide-react";

function fmtRM(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Delta({ current, prev, prefix = "" }: { current: number; prev: number; prefix?: string }) {
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "text-emerald-600" : "text-critical";
  const sign = up ? "+" : "";

  return (
    <div className={`flex items-center gap-1 text-[0.8rem] font-medium ${color}`}>
      <Icon size={11} strokeWidth={2} />
      <span>
        {sign}{pct.toFixed(2)}% vs last month
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  current,
  prev,
  prefix,
}: {
  label: string;
  value: string;
  current: number;
  prev: number;
  prefix?: string;
}) {
  return (
    <div className="bg-white rounded-[0.75rem] p-5 flex flex-col gap-2 relative overflow-hidden">
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-brand rounded-r-full" />
      <p className="text-[0.7rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant pl-2">
        {label}
      </p>
      <p className="tabular-nums text-[2rem] leading-none font-heading font-semibold pl-2 text-on-surface">
        {value}
      </p>
      <div className="pl-2">
        <Delta current={current} prev={prev} prefix={prefix} />
      </div>
    </div>
  );
}

export function SummaryCards() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Hero card */}
      <div
        className="rounded-[0.75rem] p-5 flex flex-col gap-2 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0040a1, #0056d2)" }}
      >
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.05em] text-white/70">
          Total Net Payout
        </p>
        <p
          className="tabular-nums font-heading font-bold text-white leading-none"
          style={{ fontSize: "2rem", letterSpacing: "-0.02em" }}
        >
          RM {fmtRM(mockSummary.totalNetPayout)}
        </p>
        <p className="text-[0.75rem] text-white/60 mt-auto">All time · All branches</p>
      </div>

      <StatCard
        label="Avg Monthly Salary"
        value={`RM ${fmtRM(mockSummary.avgMonthlySalary)}`}
        current={mockSummary.avgMonthlySalary}
        prev={mockPrevSummary.avgMonthlySalary}
      />
      <StatCard
        label="Total Dispatchers"
        value={fmtNum(mockSummary.totalDispatchers)}
        current={mockSummary.totalDispatchers}
        prev={mockPrevSummary.totalDispatchers}
      />
      <StatCard
        label="Total Orders"
        value={fmtNum(mockSummary.totalOrders)}
        current={mockSummary.totalOrders}
        prev={mockPrevSummary.totalOrders}
      />
    </div>
  );
}
