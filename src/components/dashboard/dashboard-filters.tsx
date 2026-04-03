"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";
import { MultiSelect } from "@/components/dashboard/multi-select";

type DateRange = "3M" | "6M" | "1Y";

const DATE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "3M", label: "Last 3 Months" },
  { value: "6M", label: "Last 6 Months" },
  { value: "1Y", label: "Last 1 Year" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const selectClass =
  "flex-1 px-2 py-1.5 text-[0.84rem] bg-surface-low rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40 cursor-pointer";

// Derive from a preset value the from/to month+year relative to current date
function presetToRange(preset: DateRange): {
  fromMonth: number; fromYear: number; toMonth: number; toYear: number;
} {
  const now = new Date();
  // Use previous month as toMonth — current month rarely has complete data
  let toMonth = now.getMonth(); // 0-indexed getMonth(), so this is last month (1-indexed)
  let toYear = now.getFullYear();
  if (toMonth === 0) { toMonth = 12; toYear--; }
  const monthsBack = preset === "3M" ? 2 : preset === "6M" ? 5 : 11;
  let fromMonth = toMonth - monthsBack;
  let fromYear = toYear;
  while (fromMonth <= 0) { fromMonth += 12; fromYear--; }
  return { fromMonth, fromYear, toMonth, toYear };
}

interface DashboardFiltersProps {
  branchCodes: string[];
}

export function DashboardFilters({ branchCodes }: DashboardFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    searchParams.get("branches")?.split(",").filter(Boolean) ?? [],
  );
  const [dateRange, setDateRange] = useState<DateRange>("3M");
  const [isCustom, setIsCustom] = useState(false);

  const defaultRange = presetToRange("3M");
  const [fromMonth, setFromMonth] = useState(defaultRange.fromMonth);
  const [fromYear, setFromYear] = useState(defaultRange.fromYear);
  const [toMonth, setToMonth] = useState(defaultRange.toMonth);
  const [toYear, setToYear] = useState(defaultRange.toYear);

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

  const dateInvalid =
    isCustom && (toYear < fromYear || (toYear === fromYear && toMonth < fromMonth));

  function handleReset() {
    setSelectedBranches([]);
    setDateRange("3M");
    setIsCustom(false);
    const r = presetToRange("3M");
    setFromMonth(r.fromMonth);
    setFromYear(r.fromYear);
    setToMonth(r.toMonth);
    setToYear(r.toYear);
    router.push("/dashboard");
  }

  function handlePresetSelect(value: DateRange) {
    setDateRange(value);
    setIsCustom(false);
    const r = presetToRange(value);
    setFromMonth(r.fromMonth);
    setFromYear(r.fromYear);
    setToMonth(r.toMonth);
    setToYear(r.toYear);
    setDateDropdownOpen(false);
  }

  function handleApply() {
    if (dateInvalid) return;
    const params = new URLSearchParams();
    if (selectedBranches.length > 0) params.set("branches", selectedBranches.join(","));
    params.set("fromMonth", String(fromMonth));
    params.set("fromYear", String(fromYear));
    params.set("toMonth", String(toMonth));
    params.set("toYear", String(toYear));
    router.push(`/dashboard?${params.toString()}`);
  }

  const buttonLabel = isCustom
    ? `${MONTH_NAMES[fromMonth - 1]} ${fromYear} – ${MONTH_NAMES[toMonth - 1]} ${toYear}`
    : DATE_OPTIONS.find((o) => o.value === dateRange)?.label ?? "Last 3 Months";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant whitespace-nowrap">
        Filter By
      </span>

      <MultiSelect
        label="Branches"
        options={branchCodes}
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
      <button
        onClick={handleApply}
        disabled={dateInvalid}
        className="px-4 py-2 bg-brand text-white text-[0.975rem] font-medium rounded-[0.375rem] hover:opacity-90 transition-opacity whitespace-nowrap disabled:opacity-40"
      >
        Apply
      </button>
    </div>
  );
}
