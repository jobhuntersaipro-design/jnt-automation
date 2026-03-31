"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MonthlyNetPayoutTrend } from "@/components/dashboard/monthly-net-payout-trend";
import { BranchDistribution } from "@/components/dashboard/branch-distribution";
import { SalaryBreakdown } from "@/components/dashboard/salary-breakdown";
import { PetrolEligibility } from "@/components/dashboard/petrol-eligibility";
import { TopDispatchers } from "@/components/dashboard/top-dispatchers";
import { MultiSelect } from "@/components/dashboard/multi-select";
import { mockBranches, mockTopDispatchers } from "@/lib/mock-data";

const branchOptions = mockBranches.map((b) => b.name);
const staffOptions = mockTopDispatchers.map((d) => d.name);

export default function DashboardPage() {
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);

  function handleReset() {
    setSelectedBranches([]);
    setSelectedStaff([]);
  }

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

          {/* Filter controls */}
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
            <MultiSelect
              label="Dispatchers"
              options={staffOptions}
              selected={selectedStaff}
              onChange={setSelectedStaff}
            />

            {/* Date range picker */}
            <button className="inline-flex items-center gap-2 px-3.5 py-2 bg-white rounded-[0.375rem] text-[0.975rem] font-medium text-on-surface border border-[rgba(195,198,214,0.3)] hover:border-[rgba(195,198,214,0.6)] transition-colors whitespace-nowrap">
              <CalendarDays size={14} className="text-on-surface-variant shrink-0" />
              Last 30 Days
            </button>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="text-[0.975rem] font-medium text-on-surface-variant hover:text-on-surface transition-colors px-1"
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
        {/* Row 1: Summary cards */}
        <SummaryCards />

        {/* Row 2: Monthly trend (60%) + Branch distribution (40%) */}
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-3"><MonthlyNetPayoutTrend /></div>
          <div className="col-span-2"><BranchDistribution /></div>
        </div>

        {/* Row 3: Salary breakdown + Petrol eligibility */}
        <div className="grid grid-cols-2 gap-4">
          <SalaryBreakdown />
          <PetrolEligibility />
        </div>

        {/* Row 4: Top performing dispatchers */}
        <div className="grid grid-cols-2 gap-4">
          <TopDispatchers />
        </div>
      </main>
    </div>
  );
}
