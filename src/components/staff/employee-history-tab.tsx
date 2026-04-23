"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  TrendingUp,
  Calendar,
  Trophy,
  BarChart3,
  History,
  PieChart,
  Target,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import type { EmployeeHistoryRecord } from "@/app/api/employees/[id]/history/route";

interface EmployeeHistoryTabProps {
  employeeId: string;
}

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const COLOR_BASIC = "var(--color-brand)";
const COLOR_ALLOWANCE = "#12B981";
const COLOR_STATUTORY = "#D4A017";
const COLOR_CRITICAL = "var(--color-critical)";

function formatRM(value: number): string {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRMNoDecimals(value: number): string {
  return `RM ${Math.round(value).toLocaleString("en-MY")}`;
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

type Tab = "performance" | "history";

export function EmployeeHistoryTab({ employeeId }: EmployeeHistoryTabProps) {
  const [records, setRecords] = useState<EmployeeHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("performance");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/history`);
      if (!res.ok) throw new Error();
      const data: EmployeeHistoryRecord[] = await res.json();
      setRecords(data);
    } catch {
      toast.error("Failed to load salary history");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const stats = useMemo(() => {
    if (records.length === 0) {
      return {
        lifetimeNet: 0,
        lifetimeGross: 0,
        months: 0,
        avgNet: 0,
        bestMonth: null as { label: string; value: number } | null,
        mix: { basic: 0, allowances: 0, statutory: 0, total: 0 },
        cleanMonths: 0,
        statutoryMonths: 0,
        mom: null as { direction: "up" | "down" | "flat"; pct: number; prevLabel: string } | null,
      };
    }

    const lifetimeNet = records.reduce((a, r) => a + r.netSalary, 0);
    const lifetimeGross = records.reduce((a, r) => a + r.grossSalary, 0);
    const months = records.length;
    const best = records.reduce((a, r) => (r.netSalary > a.netSalary ? r : a), records[0]);

    const basic = records.reduce(
      (a, r) => a + (r.basicPay || r.workingHours * r.hourlyWage),
      0,
    );
    const allowances = records.reduce(
      (a, r) => a + r.kpiAllowance + r.petrolAllowance + r.otherAllowance,
      0,
    );
    const statutory = records.reduce(
      (a, r) => a + r.epfEmployee + r.socsoEmployee + r.eisEmployee + r.pcb,
      0,
    );
    const total = basic + allowances;

    const cleanMonths = records.filter((r) => r.penalty === 0 && r.advance === 0).length;
    const statutoryMonths = records.filter(
      (r) => r.epfEmployee > 0 || r.socsoEmployee > 0 || r.eisEmployee > 0,
    ).length;

    let mom: { direction: "up" | "down" | "flat"; pct: number; prevLabel: string } | null = null;
    if (records.length >= 2) {
      const latest = records[0];
      const previous = records[1];
      const prevLabel = `vs ${MONTH_ABBR[previous.month]}`;
      if (previous.netSalary === 0) {
        mom = latest.netSalary > 0
          ? { direction: "up", pct: 100, prevLabel }
          : { direction: "flat", pct: 0, prevLabel };
      } else {
        const pct = ((latest.netSalary - previous.netSalary) / previous.netSalary) * 100;
        const direction: "up" | "down" | "flat" =
          Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
        mom = { direction, pct: Math.abs(pct), prevLabel };
      }
    }

    return {
      lifetimeNet,
      lifetimeGross,
      months,
      avgNet: lifetimeNet / months,
      bestMonth: { label: `${MONTH_ABBR[best.month]} ${best.year}`, value: best.netSalary },
      mix: { basic, allowances, statutory, total },
      cleanMonths,
      statutoryMonths,
      mom,
    };
  }, [records]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 bg-surface-hover/50 rounded-xl animate-pulse" />
        <div className="h-16 bg-surface-hover/50 rounded-xl animate-pulse" />
        <div className="h-10 bg-surface-hover/50 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface-hover/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-[0.84rem] text-on-surface-variant">
          No salary records yet. Add a payroll entry on the Staff Payroll tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero: Lifetime Earnings */}
      <div className="rounded-xl bg-gradient-to-br from-brand to-brand-container p-4 text-white">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-white/70" />
          <p className="text-[0.7rem] uppercase tracking-wider text-white/70 font-medium">
            Lifetime net pay
          </p>
        </div>
        <p className="mt-1.5 text-[1.5rem] font-bold tracking-tight tabular-nums">
          {formatRM(stats.lifetimeNet)}
        </p>
        <p className="text-[0.72rem] text-white/80 mt-0.5 tabular-nums">
          {stats.months} month{stats.months !== 1 ? "s" : ""} · {formatRM(stats.lifetimeGross)} gross
        </p>
      </div>

      {/* Stat strip — 3 tiles */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Avg / month"
          value={formatRMNoDecimals(stats.avgNet)}
          subvalue="net pay"
        />
        <StatTile
          icon={<Trophy className="w-3.5 h-3.5" />}
          label="Best month"
          value={stats.bestMonth ? formatRMNoDecimals(stats.bestMonth.value) : "—"}
          subvalue={stats.bestMonth?.label ?? ""}
        />
        <StatTile
          icon={<History className="w-3.5 h-3.5" />}
          label="Months active"
          value={String(stats.months)}
          subvalue={stats.months === 1 ? "month" : "months"}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-outline-variant/20 -mx-1 px-1 sticky top-0 bg-white z-10">
        <TabButton
          active={activeTab === "performance"}
          onClick={() => setActiveTab("performance")}
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          label="Performance"
        />
        <TabButton
          active={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          icon={<History className="w-3.5 h-3.5" />}
          label={`History · ${stats.months}`}
        />
      </div>

      {activeTab === "performance" ? (
        <div className="space-y-4">
          {stats.mom && (
            <MoMCard direction={stats.mom.direction} pct={stats.mom.pct} subLabel={stats.mom.prevLabel} />
          )}

          <EarningsMixCard mix={stats.mix} />

          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              iconColor="var(--color-brand)"
              label="Clean months"
              value={`${stats.cleanMonths} of ${stats.months}`}
              sub={`${formatPct((stats.cleanMonths / stats.months) * 100)} no penalty / advance`}
              barPct={(stats.cleanMonths / stats.months) * 100}
              barColor="var(--color-brand)"
            />
            <KpiCard
              icon={<Target className="w-3.5 h-3.5" />}
              iconColor={COLOR_STATUTORY}
              label="Statutory"
              value={`${stats.statutoryMonths} of ${stats.months}`}
              sub={`${formatPct((stats.statutoryMonths / stats.months) * 100)} contributing`}
              barPct={(stats.statutoryMonths / stats.months) * 100}
              barColor={COLOR_STATUTORY}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <HistoryRow key={r.id} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  subvalue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue: string;
}) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-card px-3 py-2.5">
      <div className="flex items-center gap-1 text-on-surface-variant/70 mb-0.5">
        {icon}
        <span className="text-[0.6rem] uppercase tracking-wider font-medium truncate">{label}</span>
      </div>
      <p className="text-[0.95rem] font-bold text-on-surface tabular-nums leading-tight truncate">{value}</p>
      <p className="text-[0.66rem] text-on-surface-variant/70 tabular-nums truncate mt-0.5">
        {subvalue || " "}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[0.78rem] font-medium border-b-2 transition-colors -mb-[1px] cursor-pointer ${
        active
          ? "text-brand border-brand"
          : "text-on-surface-variant border-transparent hover:text-on-surface hover:border-outline-variant/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MoMCard({
  direction,
  pct,
  subLabel,
}: {
  direction: "up" | "down" | "flat";
  pct: number;
  subLabel: string;
}) {
  const color =
    direction === "up" ? COLOR_ALLOWANCE : direction === "down" ? COLOR_CRITICAL : "var(--color-on-surface-variant)";
  const bgTint =
    direction === "up" ? "rgba(18, 185, 129, 0.08)" : direction === "down" ? "rgba(148, 0, 2, 0.08)" : "rgba(66, 70, 84, 0.08)";
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const label =
    direction === "up" ? "Trending up" : direction === "down" ? "Trending down" : "Holding steady";

  return (
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: bgTint, color }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[0.68rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          Latest month
        </p>
        <p className="text-[0.9rem] font-semibold text-on-surface tabular-nums">
          {label}
          {direction !== "flat" && (
            <span className="ml-1.5 tabular-nums" style={{ color }}>
              {direction === "up" ? "+" : "−"}
              {pct.toFixed(pct >= 10 ? 0 : 1)}%
            </span>
          )}
        </p>
      </div>
      <span className="text-[0.66rem] text-on-surface-variant/70 whitespace-nowrap">{subLabel}</span>
    </div>
  );
}

function EarningsMixCard({
  mix,
}: {
  mix: { basic: number; allowances: number; statutory: number; total: number };
}) {
  const total = mix.total || 1;
  const basicPct = (mix.basic / total) * 100;
  const allowancesPct = (mix.allowances / total) * 100;

  return (
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-4">
      <div className="flex items-center gap-2 mb-3">
        <PieChart className="w-3.5 h-3.5 text-on-surface-variant/70" />
        <h3 className="text-[0.7rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          Earnings mix
        </h3>
      </div>

      <div className="w-full h-2.5 rounded-full bg-surface-low overflow-hidden flex mb-3">
        {basicPct > 0 && (
          <div style={{ width: `${basicPct}%`, backgroundColor: COLOR_BASIC }} title={`Basic pay ${basicPct.toFixed(1)}%`} />
        )}
        {allowancesPct > 0 && (
          <div style={{ width: `${allowancesPct}%`, backgroundColor: COLOR_ALLOWANCE }} title={`Allowances ${allowancesPct.toFixed(1)}%`} />
        )}
      </div>

      <div className="space-y-1.5">
        <MixRow color={COLOR_BASIC} label="Basic pay / wages" amount={mix.basic} pct={basicPct} />
        <MixRow color={COLOR_ALLOWANCE} label="Allowances" amount={mix.allowances} pct={allowancesPct} />
        <MixRow color={COLOR_STATUTORY} label="Statutory (EPF+SOCSO+EIS+PCB)" amount={mix.statutory} pct={0} hideBar />
      </div>
    </div>
  );
}

function MixRow({
  color,
  label,
  amount,
  pct,
  hideBar,
}: {
  color: string;
  label: string;
  amount: number;
  pct: number;
  hideBar?: boolean;
}) {
  const muted = amount === 0;
  return (
    <div className="flex items-center gap-2 text-[0.76rem]">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, opacity: muted ? 0.3 : 1 }} />
      <span className={`flex-1 ${muted ? "text-on-surface-variant/50" : "text-on-surface-variant"}`}>{label}</span>
      <span className={`tabular-nums font-medium ${muted ? "text-on-surface-variant/50" : "text-on-surface"}`}>
        {formatRM(amount)}
      </span>
      {!hideBar && (
        <span className="tabular-nums text-on-surface-variant/70 w-10 text-right shrink-0">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  iconColor,
  label,
  value,
  sub,
  barPct,
  barColor,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  barPct: number;
  barColor: string;
}) {
  return (
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          {label}
        </span>
      </div>
      <p className="text-[0.95rem] font-bold text-on-surface tabular-nums leading-tight">{value}</p>
      <div className="mt-2 h-1 rounded-full bg-surface-low overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, barPct))}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-[0.66rem] text-on-surface-variant/70 mt-1.5 truncate">{sub}</p>
    </div>
  );
}

function HistoryRow({ record }: { record: EmployeeHistoryRecord }) {
  const basic = record.basicPay || record.workingHours * record.hourlyWage;
  const allowances = record.kpiAllowance + record.petrolAllowance + record.otherAllowance;
  const statutory = record.epfEmployee + record.socsoEmployee + record.eisEmployee + record.pcb;
  const deductions = record.penalty + record.advance;

  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-card p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[0.86rem] font-semibold text-on-surface">
          {MONTH_ABBR[record.month]} {record.year}
        </p>
        <p className="text-[1rem] font-bold text-brand tabular-nums">{formatRM(record.netSalary)}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.72rem]">
        <StatRow label="Basic / wages" value={formatRM(basic)} />
        <StatRow label="Allowances" value={formatRM(allowances)} color={allowances > 0 ? COLOR_ALLOWANCE : undefined} />
        <StatRow label="Gross" value={formatRM(record.grossSalary)} />
        <StatRow label="Statutory" value={`− ${formatRM(statutory)}`} color={statutory > 0 ? COLOR_STATUTORY : undefined} />
        {deductions > 0 && (
          <StatRow label="Penalty + advance" value={`− ${formatRM(deductions)}`} color={COLOR_CRITICAL} />
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-on-surface-variant/80 truncate">{label}</span>
      <span className="tabular-nums font-medium" style={color ? { color } : { color: "var(--color-on-surface)" }}>
        {value}
      </span>
    </div>
  );
}
