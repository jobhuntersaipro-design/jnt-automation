"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Download,
  FileText,
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
import { HistoryMonthRow } from "./history-month-row";
import type { HistoryRecord } from "./history-month-row";
import { DispatcherTrendChart } from "./dispatcher-trend-chart";

interface HistoryTabProps {
  dispatcherId: string;
  dispatcherName: string;
}

const MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const COLOR_BASE = "var(--color-brand)";
const COLOR_BONUS = "#12B981";
const COLOR_PETROL = "#D4A017";

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

export function HistoryTab({ dispatcherId, dispatcherName }: HistoryTabProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("performance");
  const initialExpanded = useRef(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/history`);
      if (!res.ok) throw new Error();
      const data: HistoryRecord[] = await res.json();
      setRecords(data);
      if (!initialExpanded.current && data.length > 0) {
        setExpandedId(data[0].salaryRecordId);
        initialExpanded.current = true;
      }
    } catch {
      toast.error("Failed to load salary history");
    } finally {
      setLoading(false);
    }
  }, [dispatcherId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function handleToggle(recordId: string) {
    // Auto-switch to History tab if user toggles a month row while on Performance
    if (activeTab !== "history") setActiveTab("history");
    setExpandedId((prev) => (prev === recordId ? null : recordId));
  }

  function handleRecalculated(recordId: string, newNetSalary: number) {
    const record = records.find((r) => r.salaryRecordId === recordId);
    const monthLabel = record ? `${MONTH_ABBR[record.month]} ${record.year}` : "";

    setRecords((prev) =>
      prev.map((r) =>
        r.salaryRecordId === recordId
          ? { ...r, netSalary: newNetSalary, wasRecalculated: true }
          : r,
      ),
    );
    toast.success(`${monthLabel} recalculated for ${dispatcherName}`);
  }

  const stats = useMemo(() => {
    if (records.length === 0) {
      return {
        lifetimeNet: 0,
        lifetimeOrders: 0,
        months: 0,
        avgOrders: 0,
        avgNet: 0,
        bestMonth: null as { label: string; value: number } | null,
        mix: { base: 0, bonus: 0, petrol: 0, grossEarnings: 0 },
        bonusHits: 0,
        cleanMonths: 0,
        mom: null as { direction: "up" | "down" | "flat"; pct: number; prevLabel: string } | null,
      };
    }
    const lifetimeNet = records.reduce((a, r) => a + r.netSalary, 0);
    const lifetimeOrders = records.reduce((a, r) => a + r.totalOrders, 0);
    const months = records.length;
    const best = records.reduce((a, r) => (r.netSalary > a.netSalary ? r : a), records[0]);

    const base = records.reduce((a, r) => a + r.baseSalary, 0);
    const bonus = records.reduce((a, r) => a + r.bonusTierEarnings, 0);
    const petrol = records.reduce((a, r) => a + r.petrolSubsidy, 0);
    const grossEarnings = base + bonus + petrol;

    const bonusHits = records.filter((r) => r.bonusTierEarnings > 0).length;
    const cleanMonths = records.filter((r) => r.penalty === 0 && r.advance === 0).length;

    // MoM: API returns records sorted most-recent first
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
      lifetimeOrders,
      months,
      avgOrders: Math.round(lifetimeOrders / months),
      avgNet: lifetimeNet / months,
      bestMonth: { label: `${MONTH_ABBR[best.month]} ${best.year}`, value: best.netSalary },
      mix: { base, bonus, petrol, grossEarnings },
      bonusHits,
      cleanMonths,
      mom,
    };
  }, [records]);

  const handleExportCsv = () => {
    setExportingCsv(true);
    window.location.href = `/api/staff/${dispatcherId}/export/csv`;
    setTimeout(() => setExportingCsv(false), 1500);
  };

  const handleExportPdf = () => {
    setExportingPdf(true);
    window.location.href = `/api/staff/${dispatcherId}/export/pdf`;
    setTimeout(() => setExportingPdf(false), 1500);
  };

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
          No salary records yet. Upload delivery data in the Payroll page to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero: Lifetime Earnings + export */}
      <div className="rounded-xl bg-gradient-to-br from-brand to-brand-container p-4 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-white/70" />
            <p className="text-[0.7rem] uppercase tracking-wider text-white/70 font-medium">
              Lifetime earnings
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.75rem] font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingCsv ? "Downloading..." : "CSV"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.75rem] font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              {exportingPdf ? "Downloading..." : "PDF"}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[1.5rem] font-bold tracking-tight tabular-nums">
          {formatRM(stats.lifetimeNet)}
        </p>
        <p className="text-[0.72rem] text-white/80 mt-0.5 tabular-nums">
          {stats.months} month{stats.months !== 1 ? "s" : ""} · {stats.lifetimeOrders.toLocaleString()} order
          {stats.lifetimeOrders !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stat strip — 3 tiles */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Avg / month"
          value={formatRMNoDecimals(stats.avgNet)}
          subvalue={`${stats.avgOrders.toLocaleString()} orders`}
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

      {/* Tab content */}
      {activeTab === "performance" ? (
        <div className="space-y-4">
          <DispatcherTrendChart
            records={records.map((r) => ({
              month: r.month,
              year: r.year,
              totalOrders: r.totalOrders,
              netSalary: r.netSalary,
              penalty: r.penalty,
            }))}
          />

          {stats.mom && (
            <MoMCard direction={stats.mom.direction} pct={stats.mom.pct} subLabel={stats.mom.prevLabel} />
          )}

          <EarningsMixCard mix={stats.mix} />

          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              icon={<Target className="w-3.5 h-3.5" />}
              iconColor={COLOR_BONUS}
              label="Bonus tier hit"
              value={`${stats.bonusHits} of ${stats.months}`}
              sub={`${formatPct((stats.bonusHits / stats.months) * 100)} of months`}
              barPct={(stats.bonusHits / stats.months) * 100}
              barColor={COLOR_BONUS}
            />
            <KpiCard
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              iconColor="var(--color-brand)"
              label="Clean months"
              value={`${stats.cleanMonths} of ${stats.months}`}
              sub={`${formatPct((stats.cleanMonths / stats.months) * 100)} no penalty / advance`}
              barPct={(stats.cleanMonths / stats.months) * 100}
              barColor="var(--color-brand)"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <HistoryMonthRow
              key={record.salaryRecordId}
              record={record}
              isExpanded={expandedId === record.salaryRecordId}
              onToggle={() => handleToggle(record.salaryRecordId)}
              dispatcherName={dispatcherName}
              dispatcherId={dispatcherId}
              onRecalculated={handleRecalculated}
            />
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
    direction === "up" ? COLOR_BONUS : direction === "down" ? "var(--color-critical)" : "var(--color-on-surface-variant)";
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
  mix: { base: number; bonus: number; petrol: number; grossEarnings: number };
}) {
  const total = mix.grossEarnings || 1;
  const basePct = (mix.base / total) * 100;
  const bonusPct = (mix.bonus / total) * 100;
  const petrolPct = (mix.petrol / total) * 100;

  return (
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 p-4">
      <div className="flex items-center gap-2 mb-3">
        <PieChart className="w-3.5 h-3.5 text-on-surface-variant/70" />
        <h3 className="text-[0.7rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          Earnings mix
        </h3>
      </div>

      {/* Stacked bar */}
      <div className="w-full h-2.5 rounded-full bg-surface-low overflow-hidden flex mb-3">
        {basePct > 0 && (
          <div
            style={{ width: `${basePct}%`, backgroundColor: COLOR_BASE }}
            title={`Base salary ${basePct.toFixed(1)}%`}
          />
        )}
        {bonusPct > 0 && (
          <div
            style={{ width: `${bonusPct}%`, backgroundColor: COLOR_BONUS }}
            title={`Bonus tier ${bonusPct.toFixed(1)}%`}
          />
        )}
        {petrolPct > 0 && (
          <div
            style={{ width: `${petrolPct}%`, backgroundColor: COLOR_PETROL }}
            title={`Petrol subsidy ${petrolPct.toFixed(1)}%`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        <MixRow color={COLOR_BASE} label="Base salary" amount={mix.base} pct={basePct} />
        <MixRow color={COLOR_BONUS} label="Bonus tier" amount={mix.bonus} pct={bonusPct} />
        <MixRow color={COLOR_PETROL} label="Petrol subsidy" amount={mix.petrol} pct={petrolPct} />
      </div>
    </div>
  );
}

function MixRow({
  color,
  label,
  amount,
  pct,
}: {
  color: string;
  label: string;
  amount: number;
  pct: number;
}) {
  const muted = amount === 0;
  return (
    <div className="flex items-center gap-2 text-[0.76rem]">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, opacity: muted ? 0.3 : 1 }} />
      <span className={`flex-1 ${muted ? "text-on-surface-variant/50" : "text-on-surface-variant"}`}>{label}</span>
      <span className={`tabular-nums font-medium ${muted ? "text-on-surface-variant/50" : "text-on-surface"}`}>
        {formatRM(amount)}
      </span>
      <span className="tabular-nums text-on-surface-variant/70 w-10 text-right shrink-0">
        {pct.toFixed(0)}%
      </span>
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
