"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
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
import { BranchChip } from "@/components/ui/branch-chip";

/**
 * Renders dropdown content into document.body via portal, anchored to a
 * button. The surrounding table uses `overflow-x-auto` which clips any
 * absolute-positioned child — portaling escapes that clip context.
 */
function PortalDropdown({
  open,
  anchorRef,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Right-align to anchor, but clamp so the dropdown never overflows the
      // viewport edges. `rightFromLeft` keeps a 6 px gutter from the right
      // edge when the anchor is close to the screen edge (prevents the
      // "Line items" dropdown slipping off-screen on narrow viewports).
      const rightFromLeft = Math.max(6, window.innerWidth - rect.right);
      setPos({ top: rect.bottom + 4, right: rightFromLeft });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, anchorRef, onClose]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        maxWidth: "calc(100vw - 12px)",
      }}
      className={`z-50 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface PayrollRecord {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  dispatcherCount: number;
  totalNetPayout: number;
  totalBaseSalary: number;
  totalBonusTierEarnings: number;
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

function RowActions({
  uploadId,
  year,
  month,
}: {
  uploadId: string;
  year: number;
  month: number;
}) {
  const summaryBtnRef = useRef<HTMLButtonElement>(null);
  const linesBtnRef = useRef<HTMLButtonElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [exportingLines, setExportingLines] = useState<"csv" | "pdf" | null>(null);

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
      <button
        ref={summaryBtnRef}
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
      <PortalDropdown
        open={summaryOpen}
        anchorRef={summaryBtnRef}
        onClose={() => setSummaryOpen(false)}
        className="min-w-48"
      >
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
      </PortalDropdown>

      {/* Line items (per-dispatcher parcel detail for the whole month) */}
      <button
        ref={linesBtnRef}
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
      <PortalDropdown
        open={linesOpen}
        anchorRef={linesBtnRef}
        onClose={() => setLinesOpen(false)}
        className="min-w-56"
      >
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
          Bundles every dispatcher&apos;s parcel detail for the whole month
          (all branches) into a single zip.
        </p>
      </PortalDropdown>
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
        bonusTierEarnings: acc.bonusTierEarnings + r.totalBonusTierEarnings,
        petrol: acc.petrol + r.totalPetrolSubsidy,
        deductions: acc.deductions + r.totalDeductions,
      }),
      { count: 0, net: 0, base: 0, bonusTierEarnings: 0, petrol: 0, deductions: 0 },
    );
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
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
          className="px-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 flex-1 min-w-32 sm:flex-none sm:w-52"
        />

        <div className="ml-auto text-[0.78rem] text-on-surface-variant/70 tabular-nums whitespace-nowrap">
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
              label="Dispatcher"
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
              Bonus Tier
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
                    r.totalBonusTierEarnings > 0 ? "text-emerald-700" : "text-on-surface-variant/40"
                  }`}
                >
                  {r.totalBonusTierEarnings > 0 ? `RM ${formatRM(r.totalBonusTierEarnings)}` : "—"}
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
                  totals.bonusTierEarnings > 0 ? "text-emerald-700" : "text-on-surface-variant/40"
                }`}
              >
                {totals.bonusTierEarnings > 0 ? `RM ${formatRM(totals.bonusTierEarnings)}` : "—"}
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
