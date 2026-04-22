"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Package,
} from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { announceBulkExportStarted } from "@/components/dashboard/bulk-jobs-indicator";

export interface PayrollRecord {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  dispatcherCount: number;
  totalNetPayout: number;
  totalBaseSalary: number;
  totalIncentive: number;
  totalPetrolSubsidy: number;
  totalDeductions: number;
}

interface PayrollHistoryProps {
  records: PayrollRecord[];
  branchCodes: string[];
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatRM(amount: number) {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type SortKey = "period" | "branch" | "staff" | "net";
type SortDir = "asc" | "desc";

function periodKey(r: PayrollRecord): number {
  return r.year * 12 + (r.month - 1);
}

function sortRecords(
  records: PayrollRecord[],
  key: SortKey,
  dir: SortDir,
): PayrollRecord[] {
  const mul = dir === "asc" ? 1 : -1;
  const copy = [...records];
  switch (key) {
    case "period":
      copy.sort((a, b) => (periodKey(a) - periodKey(b)) * mul);
      break;
    case "branch":
      copy.sort((a, b) => a.branchCode.localeCompare(b.branchCode) * mul);
      break;
    case "staff":
      copy.sort((a, b) => (a.dispatcherCount - b.dispatcherCount) * mul);
      break;
    case "net":
      copy.sort((a, b) => (a.totalNetPayout - b.totalNetPayout) * mul);
      break;
  }
  return copy;
}

function SortHeader({
  label,
  align = "left",
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: "left" | "right" | "center";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[0.65rem] font-medium uppercase tracking-wider transition-colors cursor-pointer ${
        active
          ? "text-on-surface"
          : "text-on-surface-variant/60 hover:text-on-surface-variant"
      } ${align === "right" ? "justify-end w-full" : ""} ${align === "center" ? "justify-center w-full" : ""}`}
    >
      {label}
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
    </button>
  );
}

/**
 * Branch colour chip — derives a stable hue from the branch code so each
 * branch reads as a visual unit even in a flat table.
 */
function BranchChip({ code }: { code: string }) {
  // Soft saturation; branches stay muted so they don't compete with currency columns.
  const palette = [
    { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
    { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
    { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200" },
    { bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-200" },
    { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
    { bg: "bg-sky-100", text: "text-sky-700", ring: "ring-sky-200" },
  ];
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  const c = palette[hash % palette.length];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[0.72rem] font-medium tabular-nums ring-1 ring-inset ${c.bg} ${c.text} ${c.ring}`}
    >
      {code}
    </span>
  );
}

function RowActions({
  uploadId,
  year,
  month,
}: {
  uploadId: string;
  year: number;
  month: number;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [exportingLines, setExportingLines] = useState<"csv" | "pdf" | null>(null);

  useClickOutside(summaryRef, () => setSummaryOpen(false));
  useClickOutside(linesRef, () => setLinesOpen(false));

  const handleSummaryCsv = () => {
    setSummaryOpen(false);
    window.open(`/api/payroll/upload/${uploadId}/export/csv`, "_blank");
  };

  const handleSummaryPdf = () => {
    setSummaryOpen(false);
    window.open(`/api/payroll/upload/${uploadId}/export/pdf`, "_blank");
  };

  const handleLineItems = async (format: "csv" | "pdf") => {
    setLinesOpen(false);
    setExportingLines(format);
    try {
      const res = await fetch("/api/dispatchers/month-detail/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to start export");
        return;
      }
      const { jobId } = (await res.json()) as { jobId?: string };
      if (jobId) {
        announceBulkExportStarted({ jobId, year, month, format });
      }
      const mm = String(month).padStart(2, "0");
      toast.success("Line-items export queued", {
        description: `${year}_${mm}_details.zip — you'll be notified on the bell when it's ready.`,
      });
    } catch {
      toast.error("Failed to start export");
    } finally {
      setExportingLines(null);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end whitespace-nowrap">
      <Link
        href={`/dispatchers/payroll/${uploadId}`}
        className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-brand hover:bg-brand/5 rounded transition-colors cursor-pointer"
      >
        <Eye className="w-3.5 h-3.5" aria-hidden />
        View
      </Link>

      {/* Summary (per-dispatcher totals for this branch+month) */}
      <div className="relative" ref={summaryRef}>
        <button
          type="button"
          onClick={() => {
            setSummaryOpen((v) => !v);
            setLinesOpen(false);
          }}
          aria-label="Download monthly summary"
          className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded transition-colors disabled:opacity-50 cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden />
          Summary
          <ChevronDown className="w-2.5 h-2.5" aria-hidden />
        </button>
        {summaryOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 min-w-48">
            <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wider text-on-surface-variant/60">
              Monthly summary · this branch
            </div>
            <button
              type="button"
              onClick={handleSummaryCsv}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden />
              CSV
            </button>
            <button
              type="button"
              onClick={handleSummaryPdf}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Line items (per-dispatcher parcel detail for the whole month) */}
      <div className="relative" ref={linesRef}>
        <button
          type="button"
          onClick={() => {
            setLinesOpen((v) => !v);
            setSummaryOpen(false);
          }}
          disabled={exportingLines !== null}
          aria-label="Download per-dispatcher line items"
          className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Package className="w-3.5 h-3.5" aria-hidden />
          {exportingLines ? "Queuing…" : "Line items"}
          <ChevronDown className="w-2.5 h-2.5" aria-hidden />
        </button>
        {linesOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 min-w-56">
            <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wider text-on-surface-variant/60">
              Per-dispatcher parcel detail
            </div>
            <button
              type="button"
              onClick={() => handleLineItems("csv")}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden />
              CSV zip
            </button>
            <button
              type="button"
              onClick={() => handleLineItems("pdf")}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden />
              PDF zip
            </button>
            <p className="px-3 py-1.5 text-[0.68rem] text-on-surface-variant/70 border-t border-outline-variant/15 mt-1">
              Bundles every dispatcher's parcel detail for the whole month
              (all branches) into a single zip.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PayrollHistory({ records, branchCodes }: PayrollHistoryProps) {
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set(),
  );
  const [search, setSearch] = useState("");
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("period");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const branchFilterRef = useRef<HTMLDivElement>(null);
  useClickOutside(branchFilterRef, () => setBranchDropdownOpen(false));

  const filtered = useMemo(() => {
    let result = records;
    if (selectedBranches.size > 0) {
      result = result.filter((r) => selectedBranches.has(r.branchCode));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.branchCode.toLowerCase().includes(q) ||
          MONTH_ABBR[r.month - 1].toLowerCase().includes(q) ||
          String(r.year).includes(q),
      );
    }
    return sortRecords(result, sortKey, sortDir);
  }, [records, selectedBranches, search, sortKey, sortDir]);

  const toggleBranch = (code: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "period" || key === "net" || key === "staff" ? "desc" : "asc");
    }
  };

  // Roll-up footer for the filtered view
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        count: acc.count + 1,
        net: acc.net + r.totalNetPayout,
        base: acc.base + r.totalBaseSalary,
        incentive: acc.incentive + r.totalIncentive,
        petrol: acc.petrol + r.totalPetrolSubsidy,
        deductions: acc.deductions + r.totalDeductions,
      }),
      { count: 0, net: 0, base: 0, incentive: 0, petrol: 0, deductions: 0 },
    );
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative" ref={branchFilterRef}>
          <button
            type="button"
            onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant bg-surface-card border border-outline-variant/20 rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
          >
            {selectedBranches.size === 0
              ? "All Branches"
              : `${selectedBranches.size} branch${selectedBranches.size !== 1 ? "es" : ""}`}
            <ChevronDown className="w-3.5 h-3.5" aria-hidden />
          </button>
          {branchDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 min-w-35">
              {branchCodes.map((code) => (
                <label
                  key={code}
                  className="flex items-center gap-2 px-3 py-1.5 text-[0.82rem] text-on-surface-variant hover:bg-surface-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedBranches.has(code)}
                    onChange={() => toggleBranch(code)}
                    className="rounded accent-brand"
                  />
                  {code}
                </label>
              ))}
              {selectedBranches.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedBranches(new Set())}
                  className="w-full px-3 py-1.5 text-[0.78rem] text-brand hover:bg-surface-hover text-left border-t border-outline-variant/15 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        <label className="sr-only" htmlFor="payroll-history-search">
          Search payroll history
        </label>
        <input
          id="payroll-history-search"
          type="text"
          placeholder="Search by branch or month..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 w-52"
        />

        <div className="ml-auto text-[0.78rem] text-on-surface-variant/70 tabular-nums">
          {totals.count} {totals.count === 1 ? "record" : "records"}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[0.85rem] text-on-surface-variant/60">
          No payroll records yet.
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-outline-variant/15 overflow-x-auto">
          {/* Header */}
          <div className="grid grid-cols-[minmax(6rem,0.75fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_19rem] gap-x-3 items-center px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/15">
            <SortHeader
              label="Period"
              active={sortKey === "period"}
              dir={sortDir}
              onClick={() => handleSort("period")}
            />
            <SortHeader
              label="Branch"
              active={sortKey === "branch"}
              dir={sortDir}
              onClick={() => handleSort("branch")}
            />
            <SortHeader
              label="Staff"
              align="center"
              active={sortKey === "staff"}
              dir={sortDir}
              onClick={() => handleSort("staff")}
            />
            <SortHeader
              label="Net"
              align="right"
              active={sortKey === "net"}
              dir={sortDir}
              onClick={() => handleSort("net")}
            />
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-on-surface-variant/60 text-right">
              Base
            </span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-emerald-700/80 text-right">
              Incentive
            </span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-amber-700/80 text-right">
              Petrol
            </span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-critical/80 text-right">
              Deductions
            </span>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-on-surface-variant/60 text-right">
              Actions
            </span>
          </div>

          {/* Rows */}
          <div className="flex flex-col">
            {filtered.map((r) => (
              <div
                key={r.uploadId}
                className="grid grid-cols-[minmax(6rem,0.75fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_19rem] gap-x-3 items-center px-4 py-2.5 border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-hover/60 transition-colors"
              >
                <span className="text-[0.85rem] font-medium text-on-surface">
                  {MONTH_ABBR[r.month - 1]} {r.year}
                </span>
                <span>
                  <BranchChip code={r.branchCode} />
                </span>
                <span className="text-[0.82rem] text-on-surface-variant text-center tabular-nums">
                  {r.dispatcherCount}
                </span>
                <span className="text-[0.85rem] font-semibold text-brand tabular-nums text-right whitespace-nowrap">
                  RM {formatRM(r.totalNetPayout)}
                </span>
                <span className="text-[0.82rem] text-on-surface-variant tabular-nums text-right whitespace-nowrap">
                  RM {formatRM(r.totalBaseSalary)}
                </span>
                <span
                  className={`text-[0.82rem] tabular-nums text-right whitespace-nowrap ${
                    r.totalIncentive > 0 ? "text-emerald-700" : "text-on-surface-variant/40"
                  }`}
                >
                  {r.totalIncentive > 0 ? `RM ${formatRM(r.totalIncentive)}` : "—"}
                </span>
                <span
                  className={`text-[0.82rem] tabular-nums text-right whitespace-nowrap ${
                    r.totalPetrolSubsidy > 0 ? "text-amber-700" : "text-on-surface-variant/40"
                  }`}
                >
                  {r.totalPetrolSubsidy > 0 ? `RM ${formatRM(r.totalPetrolSubsidy)}` : "—"}
                </span>
                <span
                  className={`text-[0.82rem] tabular-nums text-right whitespace-nowrap ${
                    r.totalDeductions > 0 ? "text-critical" : "text-on-surface-variant/40"
                  }`}
                >
                  {r.totalDeductions > 0 ? `− RM ${formatRM(r.totalDeductions)}` : "—"}
                </span>
                <RowActions
                  uploadId={r.uploadId}
                  year={r.year}
                  month={r.month}
                />
              </div>
            ))}
          </div>

          {/* Footer totals */}
          {totals.count > 1 && (
            <div className="grid grid-cols-[minmax(6rem,0.75fr)_minmax(4.5rem,0.55fr)_minmax(3rem,0.35fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_minmax(6.5rem,1fr)_19rem] gap-x-3 items-center px-4 py-2.5 bg-surface-container-low/60 border-t border-outline-variant/15 text-[0.78rem]">
              <span className="font-medium uppercase tracking-wider text-on-surface-variant/70 text-[0.65rem]">
                Total
              </span>
              <span />
              <span className="text-on-surface-variant text-center tabular-nums">
                {totals.count}
              </span>
              <span className="font-semibold text-brand tabular-nums text-right whitespace-nowrap">
                RM {formatRM(totals.net)}
              </span>
              <span className="text-on-surface-variant tabular-nums text-right whitespace-nowrap">
                RM {formatRM(totals.base)}
              </span>
              <span
                className={`tabular-nums text-right whitespace-nowrap ${
                  totals.incentive > 0 ? "text-emerald-700" : "text-on-surface-variant/40"
                }`}
              >
                {totals.incentive > 0 ? `RM ${formatRM(totals.incentive)}` : "—"}
              </span>
              <span
                className={`tabular-nums text-right whitespace-nowrap ${
                  totals.petrol > 0 ? "text-amber-700" : "text-on-surface-variant/40"
                }`}
              >
                {totals.petrol > 0 ? `RM ${formatRM(totals.petrol)}` : "—"}
              </span>
              <span
                className={`tabular-nums text-right whitespace-nowrap ${
                  totals.deductions > 0 ? "text-critical" : "text-on-surface-variant/40"
                }`}
              >
                {totals.deductions > 0 ? `− RM ${formatRM(totals.deductions)}` : "—"}
              </span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
