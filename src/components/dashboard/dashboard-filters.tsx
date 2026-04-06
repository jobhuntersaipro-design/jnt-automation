"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
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

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

const selectClass =
  "flex-1 px-2 py-1.5 text-[0.84rem] bg-surface-low rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40 cursor-pointer";

function presetToRange(preset: DateRange): {
  fromMonth: number; fromYear: number; toMonth: number; toYear: number;
} {
  const now = new Date();
  let toMonth = now.getMonth();
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
  const defaultRange = presetToRange("3M");
  const initFromMonth = Number(searchParams.get("fromMonth") ?? defaultRange.fromMonth);
  const initFromYear  = Number(searchParams.get("fromYear")  ?? defaultRange.fromYear);
  const initToMonth   = Number(searchParams.get("toMonth")   ?? defaultRange.toMonth);
  const initToYear    = Number(searchParams.get("toYear")    ?? defaultRange.toYear);

  function matchPreset(fm: number, fy: number, tm: number, ty: number): DateRange | null {
    for (const p of (["3M", "6M", "1Y"] as DateRange[])) {
      const r = presetToRange(p);
      if (r.fromMonth === fm && r.fromYear === fy && r.toMonth === tm && r.toYear === ty) return p;
    }
    return null;
  }

  const initPreset = matchPreset(initFromMonth, initFromYear, initToMonth, initToYear);
  const [dateRange, setDateRange] = useState<DateRange>(initPreset ?? "3M");
  const [isCustom, setIsCustom]   = useState(initPreset === null && searchParams.has("fromMonth"));

  const [fromMonth, setFromMonth] = useState(initFromMonth);
  const [fromYear,  setFromYear]  = useState(initFromYear);
  const [toMonth,   setToMonth]   = useState(initToMonth);
  const [toYear,    setToYear]    = useState(initToYear);

  const [isPending, startTransition] = useTransition();
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);
  const closeDateDropdown = useCallback(() => setDateDropdownOpen(false), []);
  useClickOutside(dateRef, closeDateDropdown);

  function push(branches: string[], fm: number, fy: number, tm: number, ty: number) {
    const params = new URLSearchParams();
    if (branches.length > 0) params.set("branches", branches.join(","));
    params.set("fromMonth", String(fm));
    params.set("fromYear", String(fy));
    params.set("toMonth", String(tm));
    params.set("toYear", String(ty));
    startTransition(() => router.push(`/dashboard?${params.toString()}`));
  }

  function handleBranchChange(branches: string[]) {
    setSelectedBranches(branches);
    push(branches, fromMonth, fromYear, toMonth, toYear);
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
    push(selectedBranches, r.fromMonth, r.fromYear, r.toMonth, r.toYear);
  }

  function handleFromChange(month: number, year: number) {
    setFromMonth(month);
    setFromYear(year);
    setIsCustom(true);
    const valid = year < toYear || (year === toYear && month <= toMonth);
    if (valid) push(selectedBranches, month, year, toMonth, toYear);
  }

  function handleToChange(month: number, year: number) {
    setToMonth(month);
    setToYear(year);
    setIsCustom(true);
    const valid = year > fromYear || (year === fromYear && month >= fromMonth);
    if (valid) push(selectedBranches, fromMonth, fromYear, month, year);
  }

  function handleReset() {
    const r = presetToRange("3M");
    setSelectedBranches([]);
    setDateRange("3M");
    setIsCustom(false);
    setFromMonth(r.fromMonth);
    setFromYear(r.fromYear);
    setToMonth(r.toMonth);
    setToYear(r.toYear);
    startTransition(() => router.push("/dashboard"));
  }

  const dateInvalid =
    isCustom && (toYear < fromYear || (toYear === fromYear && toMonth < fromMonth));

  const buttonLabel = isCustom
    ? `${MONTH_NAMES[fromMonth - 1]} ${fromYear} – ${MONTH_NAMES[toMonth - 1]} ${toYear}`
    : DATE_OPTIONS.find((o) => o.value === dateRange)?.label ?? "Last 3 Months";

  return (
    <>
      {isPending && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-brand/20 z-50 overflow-hidden">
          <div
            className="absolute top-0 h-full bg-brand rounded-full"
            style={{ animation: "progress-indeterminate-1 2s cubic-bezier(0.65,0.815,0.735,0.395) infinite" }}
          />
          <div
            className="absolute top-0 h-full bg-brand rounded-full"
            style={{ animation: "progress-indeterminate-2 2s 1.15s cubic-bezier(0.165,0.84,0.44,1) infinite" }}
          />
        </div>
      )}
    <div className="flex items-center gap-2">
      <span className="text-[0.84rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant whitespace-nowrap">
        Filter By
      </span>

      <MultiSelect
        label="Branches"
        options={branchCodes}
        selected={selectedBranches}
        onChange={handleBranchChange}
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
                      onChange={(e) => handleFromChange(Number(e.target.value), fromYear)}
                      className={selectClass}
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={fromYear}
                      onChange={(e) => handleFromChange(fromMonth, Number(e.target.value))}
                      className={selectClass}
                    >
                      {YEAR_OPTIONS.map((y) => (
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
                      onChange={(e) => handleToChange(Number(e.target.value), toYear)}
                      className={`${selectClass} ${dateInvalid ? "ring-1 ring-critical/50" : ""}`}
                    >
                      {MONTH_NAMES.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                    <select
                      value={toYear}
                      onChange={(e) => handleToChange(toMonth, Number(e.target.value))}
                      className={selectClass}
                    >
                      {YEAR_OPTIONS.map((y) => (
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
        className="text-[0.975rem] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-hover px-3 py-2 rounded-[0.375rem] transition-colors"
      >
        Reset
      </button>
    </div>
    </>
  );
}
