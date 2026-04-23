"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { TierBreakdown } from "@/lib/staff/month-detail";
import { monthDetailFilename } from "@/lib/staff/month-detail-filename";

interface LineItem {
  deliveryDate: string | null; // ISO string (server serialised)
  waybillNumber: string;
  weight: number;
  commission: number;
  isBonusTier: boolean;
}

interface MonthDetailClientProps {
  salaryRecordId: string;
  dispatcher: {
    id: string;
    name: string;
    extId: string;
    avatarUrl: string | null;
    branchCode: string;
  };
  month: number;
  year: number;
  totals: {
    totalOrders: number;
    totalWeight: number;
    baseSalary: number;
    bonusTierEarnings: number;
    netSalary: number;
  };
  /** High-performer threshold used for the highlight + cumulative counter */
  orderThreshold: number;
  tierBreakdown: TierBreakdown;
  lineItems: LineItem[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PAGE_SIZE = 50;

function formatRM(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "hero" | "neutral" | "emerald" | "amber";
}) {
  if (accent === "hero") {
    return (
      <div
        className="rounded-xl p-4 text-white flex flex-col justify-center"
        style={{ background: "linear-gradient(135deg, #0056D2, #0056d2)" }}
      >
        <p className="text-[0.72rem] uppercase tracking-wider text-white/70 font-medium">
          {label}
        </p>
        <p className="text-[1.15rem] font-bold tracking-tight mt-1 tabular-nums">
          {value}
        </p>
      </div>
    );
  }

  const border =
    accent === "emerald" ? "#12B981"
    : accent === "amber" ? "#B27F08"
    : "#424654";

  return (
    <div
      className="rounded-xl bg-surface-card p-4 border-l-4 flex flex-col justify-center"
      style={{ borderLeftColor: border }}
    >
      <p className="text-[0.72rem] uppercase tracking-wider text-on-surface-variant font-medium">
        {label}
      </p>
      <p className="text-[0.95rem] font-semibold text-on-surface mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function MonthDetailClient({
  salaryRecordId,
  dispatcher,
  month,
  year,
  totals,
  orderThreshold,
  tierBreakdown,
  lineItems,
}: MonthDetailClientProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lineItems;
    return lineItems.filter((li) => li.waybillNumber.toLowerCase().includes(q));
  }, [lineItems, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIdx = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);

  const initials = dispatcher.name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  const handleCsv = () => {
    setExportingCsv(true);
    const url = `/api/staff/${dispatcher.id}/history/${salaryRecordId}/export/csv`;
    window.location.href = url;
    setTimeout(() => setExportingCsv(false), 1500);
  };

  const handlePdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(
        `/api/staff/${dispatcher.id}/history/${salaryRecordId}/export/pdf?download=1`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        toast.error(data.error || "Failed to download PDF");
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = monthDetailFilename(year, month, dispatcher.name, "pdf");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dispatchers"
            className="p-1.5 rounded-md hover:bg-surface-hover transition-colors text-on-surface-variant"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-low text-[0.85rem] font-semibold text-on-surface-variant overflow-hidden">
            {dispatcher.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dispatcher.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div>
            <h1 className="text-[1.25rem] font-semibold text-on-surface tracking-tight">
              {dispatcher.name}
            </h1>
            <p className="text-[0.78rem] text-on-surface-variant">
              {dispatcher.extId} · {dispatcher.branchCode} · {MONTH_NAMES[month - 1]} {year}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Orders"
          value={formatNumber(totals.totalOrders)}
          accent="hero"
        />
        <StatCard
          label="Total Weight"
          value={`${totals.totalWeight.toFixed(2)} kg`}
          accent="neutral"
        />
        <StatCard
          label="Base Salary"
          value={formatRM(totals.baseSalary)}
          accent="neutral"
        />
        <StatCard
          label="Net Salary"
          value={formatRM(totals.netSalary)}
          accent="emerald"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-surface-card border border-outline-variant/15">
        <button
          onClick={handleCsv}
          disabled={exportingCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {exportingCsv ? "Downloading…" : "Download CSV"}
        </button>
        <button
          onClick={handlePdf}
          disabled={exportingPdf}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-white bg-critical rounded-md hover:bg-critical/90 transition-colors disabled:opacity-50"
        >
          <FileText className="w-3.5 h-3.5" />
          {exportingPdf ? "Generating…" : "Download PDF"}
        </button>
        <div className="flex-1" />
        <p className="text-[0.78rem] text-on-surface-variant tabular-nums">
          {formatNumber(totals.totalOrders)} parcels · {totals.totalWeight.toFixed(2)} kg
        </p>
      </div>

      {/* Base tier breakdown */}
      <div className="rounded-xl bg-surface-card border border-outline-variant/15 overflow-hidden">
        <div className="px-4 py-3 border-b border-outline-variant/15">
          <h2 className="text-[0.85rem] font-semibold text-on-surface">Weight Tier Breakdown</h2>
        </div>
        <table className="w-full text-[0.82rem]">
          <thead>
            <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant bg-surface-low">
              <th className="py-2.5 px-4 font-medium">Tier</th>
              <th className="py-2.5 px-4 font-medium">Range</th>
              <th className="py-2.5 px-4 font-medium text-right">Rate</th>
              <th className="py-2.5 px-4 font-medium text-right">Orders</th>
              <th className="py-2.5 px-4 font-medium text-right">Total Weight</th>
              <th className="py-2.5 px-4 font-medium text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {tierBreakdown.base.map((t) => (
              <tr key={t.tier} className="border-t border-outline-variant/8">
                <td className="py-2.5 px-4 font-medium text-on-surface">T{t.tier}</td>
                <td className="py-2.5 px-4 text-on-surface-variant">{t.range}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-on-surface">
                  {formatRM(t.commission)}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-on-surface">
                  {formatNumber(t.orderCount)}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-on-surface-variant">
                  {t.totalWeight.toFixed(2)} kg
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-brand">
                  {formatRM(t.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bonus tier breakdown (only when the dispatcher crossed the threshold) */}
      {tierBreakdown.bonusTierEarnings.length > 0 && (
        <div className="rounded-xl bg-emerald-50/40 border border-emerald-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-200/60 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[0.85rem] font-semibold text-emerald-900">Bonus Tier Breakdown</h2>
              <p className="text-[0.72rem] text-emerald-900/70 mt-0.5">
                Parcels #{formatNumber(orderThreshold + 1)}+ priced at bonusTierEarnings rates
              </p>
            </div>
            <span className="px-2 py-0.5 text-[0.66rem] font-medium bg-emerald-600 text-white rounded-md uppercase tracking-wide">
              High Performer
            </span>
          </div>
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="text-left text-[0.72rem] uppercase tracking-wider text-emerald-900/70 bg-emerald-100/40">
                <th className="py-2.5 px-4 font-medium">Tier</th>
                <th className="py-2.5 px-4 font-medium">Range</th>
                <th className="py-2.5 px-4 font-medium text-right">Rate</th>
                <th className="py-2.5 px-4 font-medium text-right">Orders</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Weight</th>
                <th className="py-2.5 px-4 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {tierBreakdown.bonusTierEarnings.map((t) => (
                <tr key={t.tier} className="border-t border-emerald-200/50">
                  <td className="py-2.5 px-4 font-medium text-emerald-900">T{t.tier}</td>
                  <td className="py-2.5 px-4 text-emerald-900/80">{t.range}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-emerald-900">
                    {formatRM(t.commission)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-emerald-900">
                    {formatNumber(t.orderCount)}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-emerald-900/70">
                    {t.totalWeight.toFixed(2)} kg
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-emerald-700">
                    {formatRM(t.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Parcel list */}
      <div className="rounded-xl bg-surface-card border border-outline-variant/15 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15 gap-3 flex-wrap">
          <h2 className="text-[0.85rem] font-semibold text-on-surface">
            Parcel Line Items ({formatNumber(filtered.length)})
          </h2>
          <div className="relative w-60 max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/50" />
            <input
              type="text"
              placeholder="Search by AWB…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-[0.82rem] bg-surface border border-outline-variant/20 rounded-md outline-none focus:border-brand/40"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant bg-surface-low">
                <th className="py-2.5 px-4 font-medium w-16 text-right">#</th>
                <th className="py-2.5 px-4 font-medium">Business Date</th>
                <th className="py-2.5 px-4 font-medium">AWB No.</th>
                <th className="py-2.5 px-4 font-medium text-right">Billing Weight</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((li, i) => {
                const rowNum = pageIdx * PAGE_SIZE + i + 1;
                return (
                  <tr
                    key={`${li.waybillNumber}-${i}`}
                    className={`border-t border-outline-variant/8 hover:bg-surface-hover/40 transition-colors ${
                      li.isBonusTier ? "bg-emerald-50/60 border-l-2 border-l-emerald-500" : ""
                    }`}
                    title={li.isBonusTier ? "Post-threshold parcel — priced at bonusTierEarnings tier" : undefined}
                  >
                    <td className="py-2 px-4 text-right text-on-surface-variant tabular-nums">
                      {rowNum}
                    </td>
                    <td className="py-2 px-4 text-on-surface tabular-nums">
                      {formatDate(li.deliveryDate)}
                    </td>
                    <td className="py-2 px-4 text-on-surface tabular-nums flex items-center gap-2">
                      <span>{li.waybillNumber}</span>
                      {li.isBonusTier && (
                        <span className="px-1.5 py-0.5 text-[0.62rem] font-medium bg-emerald-600 text-white rounded-md uppercase tracking-wide">
                          Bonus Tier
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-on-surface">
                      {li.weight.toFixed(2)} kg
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[0.85rem] text-on-surface-variant/60">
                    No parcels match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/15">
            <p className="text-[0.78rem] text-on-surface-variant tabular-nums">
              Page {pageIdx + 1} of {totalPages} · showing rows {pageIdx * PAGE_SIZE + 1}–
              {Math.min((pageIdx + 1) * PAGE_SIZE, filtered.length)}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, pageIdx - 1))}
                disabled={pageIdx === 0}
                className="p-1.5 rounded-md border border-outline-variant/30 text-on-surface-variant hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, pageIdx + 1))}
                disabled={pageIdx >= totalPages - 1}
                className="p-1.5 rounded-md border border-outline-variant/30 text-on-surface-variant hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
