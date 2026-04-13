"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { PreviewResult } from "@/lib/upload/pipeline";

interface DispatcherNameMap {
  [dispatcherId: string]: { name: string; avatarUrl: string | null };
}

interface PreviewTableProps {
  uploadId: string;
  results: PreviewResult[];
  dispatcherNames: DispatcherNameMap;
  onSummaryUpdate: (summary: {
    totalNetPayout: number;
    totalBaseSalary: number;
    totalIncentive: number;
    totalPetrolSubsidy: number;
    totalDeductions: number;
  }) => void;
  onResultsUpdate: (results: PreviewResult[]) => void;
}

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calculator-style deduction input: digits shift left as you type.
 * Type 5 → 0.05, type 2 → 0.52, type 0 → 5.20, etc.
 * Uses dots (.) for decimal separator.
 */
function DeductionInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (val: number) => void;
}) {
  const [cents, setCents] = useState(Math.round(value * 100));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = (cents / 100).toFixed(2);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      setCents((prev) => Math.min(prev * 10 + parseInt(e.key), 9_999_999));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setCents((prev) => Math.floor(prev / 10));
    } else if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const val = Math.round(cents) / 100;
    if (val !== value) {
      onSave(val);
    }
  }, [cents, value, onSave]);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      readOnly
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={`w-20 px-2 py-1 text-[0.82rem] tabular-nums text-right rounded-md border bg-surface transition-colors cursor-text ${
        focused
          ? "border-brand outline-none ring-1 ring-brand/30"
          : "border-outline-variant/30"
      }`}
    />
  );
}

export function PreviewTable({
  uploadId,
  results,
  dispatcherNames,
  onSummaryUpdate,
  onResultsUpdate,
}: PreviewTableProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handleDeductionChange = useCallback(
    async (dispatcherId: string, field: "penalty" | "advance", value: number) => {
      const result = results.find((r) => r.dispatcherId === dispatcherId);
      if (!result) return;

      const penalty = field === "penalty" ? value : result.penalty;
      const advance = field === "advance" ? value : result.advance;

      setUpdating(dispatcherId);
      try {
        const res = await fetch(`/api/upload/${uploadId}/preview`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatcherId, penalty, advance }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Failed to update");
          return;
        }

        const { updatedNetSalary, updatedSummary } = await res.json();

        const updated = results.map((r) =>
          r.dispatcherId === dispatcherId
            ? { ...r, penalty, advance, netSalary: updatedNetSalary }
            : r,
        );
        onResultsUpdate(updated);
        onSummaryUpdate(updatedSummary);
      } catch {
        toast.error("Failed to update deduction");
      } finally {
        setUpdating(null);
      }
    },
    [results, uploadId, onResultsUpdate, onSummaryUpdate],
  );

  return (
    <div className="rounded-lg bg-surface-card border border-outline-variant/15 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[0.82rem]">
          <thead>
            <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant bg-surface-container-low">
              <th className="py-3 px-4 font-medium">Dispatcher</th>
              <th className="py-3 px-3 font-medium text-right">Orders</th>
              <th className="py-3 px-3 font-medium text-right">Base Salary</th>
              <th className="py-3 px-3 font-medium text-right">Incentive</th>
              <th className="py-3 px-3 font-medium text-right">Petrol</th>
              <th className="py-3 px-3 font-medium text-right">Penalty</th>
              <th className="py-3 px-3 font-medium text-right">Advance</th>
              <th className="py-3 px-4 font-medium text-right">Net Salary</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const info = dispatcherNames[r.dispatcherId];
              const isUpdating = updating === r.dispatcherId;
              return (
                <tr
                  key={r.dispatcherId}
                  className={`border-t border-outline-variant/8 hover:bg-surface-container-high/50 transition-colors ${isUpdating ? "opacity-60" : ""}`}
                >
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-on-surface leading-tight">
                      {info?.name ?? r.extId}
                    </p>
                    <p className="text-[0.72rem] text-on-surface-variant/60">{r.extId}</p>
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                    {r.totalOrders.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                    {formatRM(r.baseSalary)}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${r.incentive > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                    {formatRM(r.incentive)}
                  </td>
                  <td className={`py-2.5 px-3 text-right tabular-nums ${r.petrolSubsidy > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                    {formatRM(r.petrolSubsidy)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <DeductionInput
                      value={r.penalty}
                      onSave={(val) => handleDeductionChange(r.dispatcherId, "penalty", val)}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <DeductionInput
                      value={r.advance}
                      onSave={(val) => handleDeductionChange(r.dispatcherId, "advance", val)}
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-brand">
                    {formatRM(r.netSalary)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
