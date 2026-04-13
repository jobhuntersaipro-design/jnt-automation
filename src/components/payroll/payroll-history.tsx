"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, ChevronDown, ChevronRight } from "lucide-react";
import { ExportDropdown } from "./export-buttons";

export interface PayrollRecord {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  dispatcherCount: number;
  totalNetPayout: number;
  totalBaseSalary: number;
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

function formatRM(amount: number | undefined) {
  return (amount ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DEFAULT_VISIBLE = 3;

function BranchGroup({ branchCode, items }: { branchCode: string; items: PayrollRecord[] }) {
  const [expanded, setExpanded] = useState(false);

  // Sort by year desc, month desc
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.year - a.year || b.month - a.month),
    [items],
  );

  const visible = expanded ? sorted : sorted.slice(0, DEFAULT_VISIBLE);
  const hasMore = sorted.length > DEFAULT_VISIBLE;

  return (
    <div>
      <h3 className="text-[0.78rem] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
        {branchCode}
      </h3>

      {/* Table header */}
      <div className="grid grid-cols-[7rem_5rem_1fr_1fr_1fr_10rem] gap-x-3 px-4 pb-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-on-surface-variant/60">
        <span>Month</span>
        <span className="text-center">Staff</span>
        <span className="text-right">Net Salary</span>
        <span className="text-right">Base Salary</span>
        <span className="text-right">Deductions</span>
        <span />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-0.5">
        {visible.map((item) => (
          <div
            key={item.uploadId}
            className="grid grid-cols-[7rem_5rem_1fr_1fr_1fr_10rem] gap-x-3 items-center px-4 py-2.5 rounded-md hover:bg-surface-hover transition-colors"
          >
            <span className="text-[0.85rem] font-medium text-on-surface">
              {MONTH_ABBR[item.month - 1]} {item.year}
            </span>
            <span className="text-[0.82rem] text-on-surface-variant text-center tabular-nums">
              {item.dispatcherCount}
            </span>
            <span className="text-[0.85rem] font-semibold text-brand tabular-nums text-right">
              RM {formatRM(item.totalNetPayout)}
            </span>
            <span className="text-[0.82rem] text-on-surface-variant tabular-nums text-right">
              RM {formatRM(item.totalBaseSalary)}
            </span>
            <span className={`text-[0.82rem] tabular-nums text-right ${item.totalDeductions > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
              {item.totalDeductions > 0 ? `- RM ${formatRM(item.totalDeductions)}` : "—"}
            </span>
            <div className="flex items-center gap-1 justify-end">
              <Link
                href={`/payroll/${item.uploadId}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-brand hover:bg-brand/5 rounded transition-colors"
              >
                <Eye className="w-3 h-3" />
                View
              </Link>
              <ExportDropdown uploadId={item.uploadId} />
            </div>
          </div>
        ))}
      </div>

      {/* See more / less */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-4 py-2 text-[0.78rem] font-medium text-brand hover:text-brand/80 transition-colors"
        >
          {expanded ? (
            <>Show less</>
          ) : (
            <>
              See {sorted.length - DEFAULT_VISIBLE} more
              <ChevronRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function PayrollHistory({ records, branchCodes }: PayrollHistoryProps) {
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // Filter records
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
    return result;
  }, [records, selectedBranches, search]);

  // Group by branch
  const grouped = useMemo(() => {
    const map = new Map<string, PayrollRecord[]>();
    for (const r of filtered) {
      const existing = map.get(r.branchCode);
      if (existing) {
        existing.push(r);
      } else {
        map.set(r.branchCode, [r]);
      }
    }
    return map;
  }, [filtered]);

  const toggleBranch = (code: string) => {
    setSelectedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant bg-surface-card border border-outline-variant/20 rounded-md hover:bg-surface-hover transition-colors"
          >
            {selectedBranches.size === 0
              ? "All Branches"
              : `${selectedBranches.size} branch${selectedBranches.size !== 1 ? "es" : ""}`}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {branchDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBranchDropdownOpen(false)} />
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
                    onClick={() => setSelectedBranches(new Set())}
                    className="w-full px-3 py-1.5 text-[0.78rem] text-brand hover:bg-surface-hover text-left border-t border-outline-variant/15"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <input
          type="text"
          placeholder="Search by branch or month..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 w-52"
        />
      </div>

      {/* History list */}
      {grouped.size === 0 ? (
        <div className="flex items-center justify-center py-12 text-[0.85rem] text-on-surface-variant/60">
          No payroll records yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([branchCode, items]) => (
            <BranchGroup key={branchCode} branchCode={branchCode} items={items} />
          ))}
        </div>
      )}
    </div>
  );
}
