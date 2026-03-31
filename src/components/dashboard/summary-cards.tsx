import { mockSummary, mockPrevSummary } from "@/lib/mock-data";
import { TrendingUp, TrendingDown } from "lucide-react";

function fmtRM(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCount(value: number) {
  return value.toLocaleString("en-MY");
}

function Delta({ current, prev }: { current: number; prev: number }) {
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "text-emerald-600" : "text-critical";
  const sign = up ? "+" : "";

  return (
    <div className={`flex items-center gap-1 text-[0.96rem] font-medium ${color}`}>
      <Icon size={13} strokeWidth={2} />
      <span>{sign}{pct.toFixed(1)}% vs last month</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-[0.75rem] p-5 flex flex-col gap-2 justify-center relative overflow-hidden">
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-brand rounded-r-full" />
      <p className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant pl-2">
        {label}
      </p>
      <p className="tabular-nums text-[2.4rem] leading-none font-heading font-semibold pl-2 text-on-surface">
        {value}
      </p>
      <div className="pl-2">{subtitle}</div>
    </div>
  );
}

export function SummaryCards() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Hero card */}
      <div
        className="rounded-[0.75rem] p-5 flex flex-col gap-2 justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0040a1, #0056d2)" }}
      >
        <p className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-white/70">
          Total Net Payout
        </p>
        <p
          className="tabular-nums font-heading font-bold text-white leading-none"
          style={{ fontSize: "2.4rem", letterSpacing: "-0.02em" }}
        >
          RM {fmtRM(mockSummary.totalNetPayout)}
        </p>
        <div className="flex items-center gap-1 text-[0.96rem] font-medium" style={{ color: "#10B981" }}>
          <TrendingUp size={13} strokeWidth={2} />
          <span>+12.4% vs last month</span>
        </div>
      </div>

      <StatCard
        label="Base Salary Pool"
        value={`RM ${fmtRM(mockSummary.avgMonthlySalary)}`}
        subtitle={
          <p className="text-[0.96rem] text-on-surface-variant">92% of total budget</p>
        }
      />
      <StatCard
        label="Total Dispatchers"
        value={fmtCount(mockSummary.totalDispatchers)}
        subtitle={<Delta current={mockSummary.totalDispatchers} prev={mockPrevSummary.totalDispatchers} />}
      />
      <StatCard
        label="Total Orders"
        value={fmtCount(mockSummary.totalOrders)}
        subtitle={<Delta current={mockSummary.totalOrders} prev={mockPrevSummary.totalOrders} />}
      />
    </div>
  );
}
