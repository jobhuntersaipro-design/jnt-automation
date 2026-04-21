"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmployeeList } from "./employee-list";
import { PayrollTab } from "./payroll-tab";
import type { StaffEmployee } from "@/lib/db/employees";

type Tab = "settings" | "payroll";

interface StaffEmployeesClientProps {
  employees: StaffEmployee[];
  branchCodes: string[];
}

export function StaffEmployeesClient({ employees, branchCodes: initialBranchCodes }: StaffEmployeesClientProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "payroll" ? "payroll" : "settings";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [localBranchCodes, setLocalBranchCodes] = useState<string[]>(initialBranchCodes);

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    const url = tab === "payroll" ? "/staff?tab=payroll" : "/staff";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-5 pb-3 lg:pb-4 bg-surface/80 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.2rem] lg:text-[1.36rem] text-on-surface tracking-tight">Staff</h1>
            <p className="text-[0.72rem] text-on-surface-variant mt-0.5 hidden sm:block">
              Manage employees and salary records across all branches.
            </p>
          </div>
        </div>
        {/* Tab Switcher */}
        <div className="flex items-center gap-1 mt-3 bg-surface-dim/50 rounded-[0.375rem] p-0.5 w-fit">
          <button
            onClick={() => switchTab("settings")}
            className={`px-4 py-1.5 text-[0.84rem] font-medium rounded-lg transition-colors ${
              activeTab === "settings"
                ? "bg-white text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => switchTab("payroll")}
            className={`px-4 py-1.5 text-[0.84rem] font-medium rounded-lg transition-colors ${
              activeTab === "payroll"
                ? "bg-white text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Payroll
          </button>
        </div>
      </header>

      <main className="px-4 lg:px-8 pb-16 space-y-4">
        {activeTab === "payroll" ? (
          <PayrollTab />
        ) : (
          <EmployeeList
            employees={employees}
            branchCodes={localBranchCodes}
            onBranchAdded={(code) => setLocalBranchCodes((prev) => [...prev, code])}
          />
        )}
      </main>
    </div>
  );
}
