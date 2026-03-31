"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthlyNetPayoutTrend } from "@/components/dashboard/monthly-net-payout-trend";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { SalaryBreakdown } from "@/components/dashboard/salary-breakdown";
import { IncentiveHitRate } from "@/components/dashboard/incentive-hit-rate";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { MultiSelect } from "@/components/dashboard/multi-select";
import { mockBranches } from "@/lib/mock-data";

export type ChartRange = { from: number; to: number };

type DateRange = "3M" | "6M" | "1Y";

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "3M", label: "Last 3 Months" },
  { value: "6M", label: "Last 6 Months" },
  { value: "1Y", label: "Last 1 Year" },
];

const PRESET_RANGES: Record<DateRange, ChartRange> = {
  "3M": { from: 9, to: 11 },
  "6M": { from: 6, to: 11 },
  "1Y": { from: 0, to: 11 },
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const branchOptions = mockBranches.map((b) => b.name);

const selectClass =
  "flex-1 px-2 py-1.5 text-[0.84rem] bg-surface-low rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40 cursor-pointer";

export default function DashboardPage() {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>("3M");
  const [isCustom, setIsCustom] = useState(false);
  const [fromMonth, setFromMonth] = useState(10);
  const [fromYear, setFromYear] = useState(2026);
  const [toMonth, setToMonth] = useState(12);
  const [toYear, setToYear] = useState(2026);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const dateInvalid = isCustom && toMonth < fromMonth;

  const chartRange: ChartRange = isCustom
    ? { from: Math.max(0, fromMonth - 1), to: Math.max(fromMonth - 1, Math.min(11, toMonth - 1)) }
    : PRESET_RANGES[dateRange];

  function handleReset() {
    setSelectedBranches([]);
    setDateRange("3M");
    setIsCustom(false);
    setFromMonth(10);
    setToMonth(12);
  }

  function handlePresetSelect(value: DateRange) {
    setDateRange(value);
    setIsCustom(false);
    setDateDropdownOpen(false);
  }

  const buttonLabel = isCustom
    ? `${MONTH_NAMES[fromMonth - 1]} ${fromYear} – ${MONTH_NAMES[toMonth - 1]} ${toYear}`
    : DATE_OPTIONS.find((o) => o.value === dateRange)?.label ?? "Last 3 Months";

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 px-8 pt-7 pb-5 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.8rem] text-on-surface tracking-tight">
              Overview
            </h1>
            <p className="text-[0.975rem] text-on-surface-variant mt-0.5">
              All-time performance and salary distribution across branches and dispatchers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant whitespace-nowrap">
              Filter By
            </span>

            <MultiSelect
              label="Branches"
              options={branchOptions}
              selected={selectedBranches}
              onChange={setSelectedBranches}
            />

            {/* Date range dropdown */}
            <div ref={dateRef} className="relative">
              <button
                onClick={() => setDateDropdownOpen((o) => !o)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 bg-white rounded-[0.375rem] text-[0.975rem] font-medium text-on-surface border transition-colors whitespace-nowrap ${
                  dateInvalid
                    ? "border-critical/60 hover:border-critical"
                    : "border-[rgba(195,198,214,0.3)] hover:border-[rgba(195,198,214,0.6)]"
                }`}
              >
                <CalendarDays size={14} className="text-on-surface-variant shrink-0" />
                {buttonLabel}
                <ChevronDown
                  size={13}
                  className={`text-on-surface-variant transition-transform shrink-0 ${dateDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {dateDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-[rgba(195,198,214,0.2)] z-50 w-56 py-1 overflow-hidden">
                  {DATE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handlePresetSelect(option.value)}
                      className={`w-full text-left px-4 py-2.5 text-[0.9rem] transition-colors ${
                        !isCustom && dateRange === option.value
                          ? "text-brand font-semibold bg-surface-low"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  <div className="border-t border-outline-variant/20 my-1" />
                  <div className="px-3 pb-3 pt-1">
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-on-surface-variant mb-2">
                      Custom Range
                    </p>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="text-[0.72rem] text-on-surface-variant block mb-1">From</label>
                        <div className="flex gap-1">
                          <select
                            value={fromMonth}
                            onChange={(e) => { setFromMonth(Number(e.target.value)); setIsCustom(true); }}
                            className={selectClass}
                          >
                            {MONTH_NAMES.map((m, i) => (
                              <option key={i} value={i + 1}>{m}</option>
                            ))}
                          </select>
                          <select
                            value={fromYear}
                            onChange={(e) => { setFromYear(Number(e.target.value)); setIsCustom(true); }}
                            className={selectClass}
                          >
                            {[2025, 2026, 2027].map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[0.72rem] text-on-surface-variant block mb-1">To</label>
                        <div className="flex gap-1">
                          <select
                            value={toMonth}
                            onChange={(e) => { setToMonth(Number(e.target.value)); setIsCustom(true); }}
                            className={`${selectClass} ${dateInvalid ? "ring-1 ring-critical/50" : ""}`}
                          >
                            {MONTH_NAMES.map((m, i) => (
                              <option key={i} value={i + 1}>{m}</option>
                            ))}
                          </select>
                          <select
                            value={toYear}
                            onChange={(e) => { setToYear(Number(e.target.value)); setIsCustom(true); }}
                            className={selectClass}
                          >
                            {[2025, 2026, 2027].map((y) => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                        {dateInvalid && (
                          <p className="text-[0.72rem] text-critical mt-1">
                            End date must be after the start date.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="text-[0.975rem] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-low px-3 py-2 rounded-[0.375rem] transition-colors"
            >
              Reset
            </button>

            <div className="w-px h-5 bg-outline-variant/30 mx-1" />

            {/* Apply */}
            <button className="px-4 py-2 bg-brand text-white text-[0.975rem] font-medium rounded-[0.375rem] hover:opacity-90 transition-opacity whitespace-nowrap">
              Apply
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 pb-16 space-y-6">
        <SummaryCards />

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3">
            <MonthlyNetPayoutTrend chartRange={chartRange} />
          </div>
          <div className="col-span-2">
            <BranchDistribution selectedBranches={selectedBranches} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SalaryBreakdown chartRange={chartRange} />
          <IncentiveHitRate chartRange={chartRange} />
        </div>

        <TopDispatchers selectedBranches={selectedBranches} />
      </main>
    </div>
  );
}
