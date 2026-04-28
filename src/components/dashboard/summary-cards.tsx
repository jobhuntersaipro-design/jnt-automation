import { TrendingUp, TrendingDown } from "lucide-react";
import type { SummaryStats, Filters } from "@/lib/db/overview";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getPrevPeriodLabel(filters: Filters): string {
  const { fromMonth, fromYear, toMonth, toYear } = filters;
  // Count months in the selected range
  const count = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  // Shift start back by count months
  let prevToMonth = fromMonth - 1;
  let prevToYear = fromYear;
  if (prevToMonth <= 0) { prevToMonth += 12; prevToYear--; }
  let prevFromMonth = prevToMonth - (count - 1);
  let prevFromYear = prevToYear;
  while (prevFromMonth <= 0) { prevFromMonth += 12; prevFromYear--; }

  if (count === 1) {
    return `${MONTH_ABBR[prevFromMonth - 1]} ${prevFromYear}`;
  }
  return `${MONTH_ABBR[prevFromMonth - 1]} ${prevFromYear} – ${MONTH_ABBR[prevToMonth - 1]} ${prevToYear}`;
}

function fmtRM(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCount(value: number) {
  return value.toLocaleString("en-MY");
}

function Delta({ current, prev, invert = false }: { current: number; prev: number; invert?: boolean }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = invert
    ? up ? "text-emerald-300" : "text-red-300"
    : up ? "text-emerald-600" : "text-critical";
  const sign = up ? "+" : "";

  return (
    <div className={`flex items-center gap-1 text-[0.96rem] font-medium ${color}`}>
      <Icon size={13} strokeWidth={2} />
      <span>{sign}{pct.toFixed(1)}% vs last period</span>
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

function TotalPeopleCard({ data }: { data: SummaryStats }) {
  const dispatcherEmpty = data.totalDispatchers === 0;
  const staffEmpty = data.totalStaff === 0;
  const total = data.totalDispatchers + data.totalStaff;
  return (
    <div className="bg-white rounded-[0.75rem] p-5 flex flex-col gap-2 justify-center relative overflow-hidden">
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-brand rounded-r-full" />
      <p className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant pl-2">
        Total People
      </p>
      <div className="pl-2 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.78rem] text-on-surface-variant">Dispatchers</span>
          <span
            className={`tabular-nums text-[1.05rem] font-semibold ${
              dispatcherEmpty ? "text-on-surface-variant/40" : "text-on-surface"
            }`}
          >
            {dispatcherEmpty ? "—" : fmtCount(data.totalDispatchers)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.78rem] text-on-surface-variant">Staff</span>
          <span
            className={`tabular-nums text-[1.05rem] font-semibold ${
              staffEmpty ? "text-on-surface-variant/40" : "text-on-surface"
            }`}
          >
            {staffEmpty ? "—" : fmtCount(data.totalStaff)}
          </span>
        </div>
      </div>
      <p className="pl-2 text-[0.78rem] text-on-surface-variant tabular-nums">
        {total} unique people
      </p>
    </div>
  );
}

function AvgMonthlySalaryCard({ data }: { data: SummaryStats }) {
  const dispatcherAvg = data.avgMonthlySalary.dispatcher;
  const staffAvg = data.avgMonthlySalary.staff;
  const dispatcherEmpty = dispatcherAvg === 0;
  const staffEmpty = staffAvg === 0;
  // Combined-period average for the delta — meaningful only if both periods
  // had any people. Falls back to whichever side has data.
  const combined = dispatcherAvg + staffAvg;
  const prevCombined = data.prev.avgMonthlySalary.dispatcher + data.prev.avgMonthlySalary.staff;

  return (
    <div className="bg-white rounded-[0.75rem] p-5 flex flex-col gap-2 justify-center relative overflow-hidden">
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-brand rounded-r-full" />
      <p className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant pl-2">
        Avg Monthly Salary
      </p>
      <div className="pl-2 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.78rem] text-on-surface-variant">Dispatchers</span>
          <span
            className={`tabular-nums text-[1.05rem] font-semibold ${
              dispatcherEmpty ? "text-on-surface-variant/40" : "text-on-surface"
            }`}
          >
            {dispatcherEmpty ? "—" : `RM ${fmtRM(dispatcherAvg)}`}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.78rem] text-on-surface-variant">Staff</span>
          <span
            className={`tabular-nums text-[1.05rem] font-semibold ${
              staffEmpty ? "text-on-surface-variant/40" : "text-on-surface"
            }`}
          >
            {staffEmpty ? "—" : `RM ${fmtRM(staffAvg)}`}
          </span>
        </div>
      </div>
      <div className="pl-2"><Delta current={combined} prev={prevCombined} /></div>
    </div>
  );
}

export function SummaryCards({ data, filters }: { data: SummaryStats; filters: Filters }) {
  const prevLabel = getPrevPeriodLabel(filters);
  return (
    <div className="flex flex-col gap-2">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
          RM {fmtRM(data.totalNetPayout)}
        </p>
        <p className="text-[0.78rem] text-white/80 tabular-nums">
          Dispatchers RM {fmtRM(data.netPayoutByRole.dispatcher)}
          {" · "}
          Staff RM {fmtRM(data.netPayoutByRole.staff)}
        </p>
        <Delta current={data.totalNetPayout} prev={data.prev.totalNetPayout} invert />
      </div>

      <AvgMonthlySalaryCard data={data} />
      <TotalPeopleCard data={data} />
      <StatCard
        label="Total Orders"
        value={fmtCount(data.totalOrders)}
        subtitle={<Delta current={data.totalOrders} prev={data.prev.totalOrders} />}
      />
    </div>
    <p className="text-[0.78rem] text-on-surface-variant/70">
      % changes compared to {prevLabel}
    </p>
    </div>
  );
}
