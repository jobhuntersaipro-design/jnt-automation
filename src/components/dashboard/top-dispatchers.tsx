"use client";

import { useState } from "react";
import { mockTopDispatchers } from "@/lib/mock-data";

type FilterKey = "netSalary" | "totalOrders" | "baseSalary";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "netSalary", label: "Net Salary" },
  { key: "totalOrders", label: "Orders" },
  { key: "baseSalary", label: "Base Salary" },
];

function fmt(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtOrders(value: number) {
  return value.toLocaleString("en-MY");
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
      className="w-11 h-11 rounded-full flex items-center justify-center bg-surface-low text-[0.9rem] font-semibold text-on-surface-variant shrink-0"
      style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
    >
      {initials}
    </div>
  );
}

export function TopDispatchers() {
  const [filter, setFilter] = useState<FilterKey>("netSalary");

  const sorted = [...mockTopDispatchers].sort((a, b) => b[filter] - a[filter]);

  function displayValue(d: (typeof mockTopDispatchers)[0]) {
    if (filter === "totalOrders") return `${fmtOrders(d.totalOrders)} orders`;
    if (filter === "baseSalary") return `RM ${fmt(d.baseSalary)}`;
    return `RM ${fmt(d.netSalary)}`;
  }

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-critical">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
            Top Performing Dispatchers
          </h2>
          <p className="text-[0.9rem] text-on-surface-variant mt-0.5">Ranked by selected metric</p>
        </div>
        <button className="text-[0.9rem] text-brand font-medium hover:underline shrink-0">
          View All Staff
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-surface-low rounded-[0.375rem] p-1 w-fit">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-[0.84rem] font-semibold rounded-lg transition-colors whitespace-nowrap ${
              filter === key
                ? "bg-white text-on-surface shadow-[0_1px_4px_rgba(25,28,29,0.08)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-white/60"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((d, i) => (
          <div
            key={d.id}
            className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-low transition-colors"
          >
            <span className="text-[0.84rem] font-semibold text-on-surface-variant w-5 shrink-0 text-center">
              {i + 1}
            </span>
            <Avatar name={d.name} gender={d.gender} />
            <div className="flex-1 min-w-0">
              <p className="text-[0.975rem] font-medium text-on-surface truncate">{d.name}</p>
              <p className="text-[0.84rem] text-on-surface-variant">
                {d.branch} · {fmtOrders(d.totalOrders)} deliveries
              </p>
            </div>
            <span className="tabular-nums text-[1.05rem] font-semibold text-brand shrink-0">
              {displayValue(d)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
