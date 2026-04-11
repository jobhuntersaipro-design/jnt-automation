"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PayrollStateMachine } from "./payroll-state-machine";
import { PayrollHistory, type PayrollRecord } from "./payroll-history";

interface PayrollClientProps {
  initialHistory: PayrollRecord[];
  branchCodes: string[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PayrollClient({ initialHistory, branchCodes }: PayrollClientProps) {
  const now = new Date();
  const [selectedBranch, setSelectedBranch] = useState(branchCodes[0] ?? "");
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [history, setHistory] = useState<PayrollRecord[]>(initialHistory);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const handleScrollToHistory = useCallback(() => {
    historyRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // Silent — history will be stale but not broken
    }
  }, []);

  // Year range: 2024 to current year + 1
  const years = Array.from({ length: now.getFullYear() - 2024 + 2 }, (_, i) => 2024 + i);

  return (
    <main className="flex-1 overflow-y-auto px-16 py-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-10">
        {/* Page header */}
        <div>
          <h1 className="text-[1.6rem] font-bold text-on-surface tracking-tight font-[family-name:var(--font-manrope)]">
            Payroll
          </h1>
          <p className="text-[0.85rem] text-on-surface-variant mt-0.5">
            Upload delivery data and manage monthly payroll records.
          </p>
        </div>

        {/* Top section — Current Upload */}
        <section className="flex flex-col gap-4">
          {/* Branch + Month/Year selectors */}
          <div className="flex items-center gap-3">
            {/* Branch selector */}
            <div className="relative">
              <button
                onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.85rem] font-medium text-on-surface bg-surface-card border border-outline-variant/20 rounded-md hover:bg-surface-hover transition-colors min-w-[100px]"
              >
                {selectedBranch || "Select branch"}
                <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant ml-auto" />
              </button>
              {branchDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBranchDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-20 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 min-w-[100px]">
                    {branchCodes.map((code) => (
                      <button
                        key={code}
                        onClick={() => {
                          setSelectedBranch(code);
                          setBranchDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-[0.82rem] hover:bg-surface-hover transition-colors ${
                          code === selectedBranch ? "font-semibold text-brand" : "text-on-surface-variant"
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Month selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 text-[0.85rem] font-medium text-on-surface bg-surface-card border border-outline-variant/20 rounded-md hover:bg-surface-hover transition-colors outline-none cursor-pointer"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>

            {/* Year selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 text-[0.85rem] font-medium text-on-surface bg-surface-card border border-outline-variant/20 rounded-md hover:bg-surface-hover transition-colors outline-none cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* State machine */}
          {selectedBranch && (
            <PayrollStateMachine
              key={`${selectedBranch}-${selectedMonth}-${selectedYear}`}
              branchCode={selectedBranch}
              month={selectedMonth}
              year={selectedYear}
              onScrollToHistory={handleScrollToHistory}
              onUploadComplete={refreshHistory}
            />
          )}
        </section>

        {/* Divider */}
        <div className="h-px bg-outline-variant/20" />

        {/* Bottom section — Payroll History */}
        <section ref={historyRef}>
          <h2 className="text-[1.1rem] font-semibold text-on-surface mb-4 font-[family-name:var(--font-manrope)]">
            Payroll History
          </h2>
          <PayrollHistory records={history} branchCodes={branchCodes} />
        </section>
      </div>
    </main>
  );
}
