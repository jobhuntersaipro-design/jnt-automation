"use client";

import { useState } from "react";
import { Search, ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";

type DispatcherRow = {
  id: string;
  name: string;
  branch: string;
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  avatarUrl: string | null;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  netSalary: number;
};

type SortKey = "name" | "branch" | "netSalary" | "baseSalary" | "incentive" | "petrolSubsidy";
type SortDir = "asc" | "desc";

const TOP_N = 5;

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
  { key: "netSalary", label: "NET SALARY" },
  { key: "baseSalary", label: "BASE SALARY" },
  { key: "incentive", label: "INCENTIVE" },
  { key: "petrolSubsidy", label: "PETROL" },
];

function DispatcherTable({
  title,
  subtitle,
  defaultDir,
  data,
}: {
  title: string;
  subtitle: string;
  defaultDir: SortDir;
  data: DispatcherRow[];
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("netSalary");
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(defaultDir);
    }
  }

  const sorted = [...data]
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
    })
    .slice(0, TOP_N);

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
        <div className="relative shrink-0">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-[0.84rem] bg-surface-low rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-brand/40 w-36 transition-shadow"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-col">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] px-2 pb-2">
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
            <div
              key={d.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center px-2 py-[0.9rem] rounded-lg hover:bg-surface-hover transition-colors"
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
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="pt-1 border-t border-outline-variant/20">
        <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
          Showing top {Math.min(TOP_N, sorted.length)} of {data.length} total
        </span>
      </div>
    </div>
  );
}

export function TopDispatchers({ data }: { data: DispatcherRow[] }) {
  return (
    <DispatcherTable
      title="Dispatcher Performance"
      subtitle="Sort by any column — highest net salary by default"
      defaultDir="desc"
      data={data}
    />
  );
}
