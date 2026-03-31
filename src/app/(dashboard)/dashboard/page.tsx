"use client";

import { useState } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ChartPlaceholder } from "@/components/dashboard/chart-placeholder";
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

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top bar */}
      <header className="sticky top-0 z-10 px-8 pt-7 pb-5 bg-surface/80 backdrop-blur-md">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-heading font-bold text-[1.5rem] text-on-surface tracking-tight">
              Overview
            </h1>
            <p className="text-[0.8125rem] text-on-surface-variant mt-0.5">
              All-time performance and salary distribution across branches and dispatchers.
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 shrink-0">
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
            <button className="px-4 py-2 bg-brand text-white text-[0.8125rem] font-medium rounded-[0.375rem] hover:bg-brand-container transition-colors">
              Apply
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-8 pb-10 space-y-6">
        {/* Row 1: Summary cards */}
        <SummaryCards />

        {/* Row 2: Monthly trend + Branch distribution */}
        <div className="grid grid-cols-2 gap-4">
          <ChartPlaceholder />
          <BranchDistribution />
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
