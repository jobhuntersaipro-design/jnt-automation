"use client";

import { useMemo, useState } from "react";
import { Eye, ChevronDown } from "lucide-react";

export interface PayrollRecord {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  dispatcherCount: number;
  totalNetPayout: number;
}

interface PayrollHistoryProps {
  records: PayrollRecord[];
  branchCodes: string[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatRM(amount: number) {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          MONTH_NAMES[r.month - 1].toLowerCase().includes(q) ||
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
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {/* Branch multi-select */}
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

        {/* Dispatcher search */}
        <input
          type="text"
          placeholder="Search by name or ID..."
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
        <div className="flex flex-col gap-5">
          {Array.from(grouped.entries()).map(([branchCode, items]) => (
            <div key={branchCode}>
              <h3 className="text-[0.78rem] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                {branchCode}
              </h3>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <div
                    key={item.uploadId}
                    className="flex items-center justify-between px-4 py-3 rounded-md hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex items-center gap-6">
                      <span className="text-[0.88rem] font-medium text-on-surface w-36">
                        {MONTH_NAMES[item.month - 1]} {item.year}
                      </span>
                      <span className="text-[0.82rem] text-on-surface-variant">
                        {item.dispatcherCount} dispatcher{item.dispatcherCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[0.88rem] font-semibold text-brand tabular-nums">
                        {formatRM(item.totalNetPayout)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-[0.78rem] font-medium text-brand hover:bg-brand/5 rounded transition-colors"
                        title="View payroll details (coming soon)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1 text-[0.78rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded transition-colors"
                        title="Export options (coming soon)"
                      >
                        Export
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
