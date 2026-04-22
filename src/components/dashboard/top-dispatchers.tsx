"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronUp, ChevronDown as ChevronDownIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { DispatcherRow } from "@/lib/db/overview";

type SortKey = "name" | "branch" | "totalOrders" | "netSalary" | "baseSalary" | "incentive" | "petrolSubsidy" | "deductions";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

function fmt(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Avatar({ name, gender }: { name: string; gender: "MALE" | "FEMALE" | "UNKNOWN" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const ringColor =
    gender === "MALE" ? "#0056D2" : gender === "FEMALE" ? "#f472b6" : "#c3c6d6";
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-low text-[0.8rem] font-semibold text-on-surface-variant shrink-0"
      style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
    >
      {initials}
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronDownIcon size={11} className="text-outline-variant opacity-50" />;
  return sortDir === "asc"
    ? <ChevronUp size={11} className="text-brand" />
    : <ChevronDownIcon size={11} className="text-brand" />;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "DISPATCHER" },
  { key: "branch", label: "BRANCH" },
  { key: "totalOrders", label: "ORDERS" },
  { key: "netSalary", label: "NET SALARY" },
  { key: "baseSalary", label: "BASE SALARY" },
  { key: "incentive", label: "INCENTIVE" },
  { key: "petrolSubsidy", label: "PETROL" },
  { key: "deductions", label: "DEDUCTIONS" },
];

function getPageNumbers(current: number, total: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("...");
  }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total) {
    if (end < total - 1) pages.push("...");
    pages.push(total);
  }
  return pages;
}

function DispatcherTable({
  title,
  subtitle,
  defaultDir,
  data,
  action,
}: {
  title: string;
  subtitle: string;
  defaultDir: SortDir;
  data: DispatcherRow[];
  action?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("netSalary");
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);
  const [page, setPage] = useState(1);

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(defaultDir);
    }
    setPage(1);
  }

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  const filtered = [...data]
    .filter(
      (d) =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.id.toLowerCase().includes(query.toLowerCase()) ||
        d.branch.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const sorted = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface leading-tight">
            {title}
          </h2>
          <p className="text-[0.9rem] text-on-surface-variant mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-[0.84rem] bg-surface-low rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-brand/40 w-36 transition-shadow"
          />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-col overflow-x-auto">
        {/* Column headers */}
        <div className="grid grid-cols-[2.5fr_1fr_0.8fr_1fr_1fr_1fr_1fr_1fr] gap-x-2 px-2 pb-2">
          {COLUMNS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`flex items-center gap-1 text-[0.86rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase hover:text-on-surface transition-colors text-left ${key === "name" ? "pl-10" : ""}`}
            >
              {label}
              <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
            </button>
          ))}
        </div>

        {/* Rows */}
        {sorted.length === 0 ? (
          <p className="text-[0.84rem] text-on-surface-variant px-2 py-4">No dispatchers found.</p>
        ) : (
          sorted.map((d) => (
            <Link
              key={d.id}
              href={`/dispatchers?highlight=${d.id}`}
              data-testid="top-dispatchers-row"
              data-dispatcher-id={d.id}
              data-dispatcher-name={d.name}
              aria-label={`Open salary history for ${d.name}`}
              className="grid grid-cols-[2.5fr_1fr_0.8fr_1fr_1fr_1fr_1fr_1fr] gap-x-2 items-center px-2 py-[0.9rem] rounded-lg hover:bg-surface-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              {/* Dispatcher */}
              <div className="flex items-center gap-2 min-w-0 pl-10">
                <Avatar name={d.name} gender={d.gender} />
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-medium text-on-surface truncate">{d.name}</p>
                  <p className="text-[0.72rem] text-on-surface-variant">{d.id}</p>
                </div>
              </div>

              {/* Branch chip */}
              <span className="inline-block px-2 py-0.5 text-[0.85rem] font-medium text-on-surface-variant bg-surface-low rounded-[0.375rem] w-fit">
                {d.branch}
              </span>

              {/* Total Orders */}
              <span className="tabular-nums text-[0.875rem] text-on-surface">
                {d.totalOrders.toLocaleString()}
              </span>

              {/* Net Salary */}
              <span className="tabular-nums text-[0.95rem] font-semibold text-brand">
                RM {fmt(d.netSalary)}
              </span>

              {/* Base Salary */}
              <span className="tabular-nums text-[0.875rem] text-on-surface-variant">
                RM {fmt(d.baseSalary)}
              </span>

              {/* Incentive */}
              <span className="tabular-nums text-[0.875rem] text-on-surface-variant">
                RM {fmt(d.incentive)}
              </span>

              {/* Petrol Subsidy */}
              <span className="tabular-nums text-[0.875rem] text-on-surface-variant">
                RM {fmt(d.petrolSubsidy)}
              </span>

              {/* Deductions */}
              <span className={`tabular-nums text-[0.875rem] ${d.deductions > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
                {d.deductions > 0 ? `RM ${fmt(d.deductions)}` : "—"}
              </span>
            </Link>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="pt-1 border-t border-outline-variant/20 flex items-center justify-between">
        <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
          Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {getPageNumbers(page, totalPages).map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="text-[0.72rem] text-on-surface-variant px-1">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`w-7 h-7 flex items-center justify-center rounded-[0.375rem] text-[0.72rem] font-medium tabular-nums transition-colors ${
                    page === p
                      ? "bg-brand text-white"
                      : "text-on-surface-variant hover:bg-surface-hover"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TopDispatchers({ data, action }: { data: DispatcherRow[]; action?: React.ReactNode }) {
  return (
    <DispatcherTable
      title="Dispatcher Performance"
      subtitle="Sort by any column — highest net salary by default"
      defaultDir="desc"
      data={data}
      action={action}
    />
  );
}
