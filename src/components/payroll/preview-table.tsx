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

function DeductionInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (val: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBlur = useCallback(() => {
    const num = parseFloat(localValue);
    if (isNaN(num) || num < 0) {
      setLocalValue(value.toString());
      return;
    }
    if (num !== value) {
      onSave(Math.round(num * 100) / 100);
    }
  }, [localValue, value, onSave]);

  return (
    <input
      ref={inputRef}
      type="number"
      min="0"
      step="0.01"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") inputRef.current?.blur();
      }}
      className="w-20 px-2 py-1 text-[0.82rem] tabular-nums text-right rounded-md border border-outline-variant/30 bg-surface focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30 transition-colors"
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

        // Update local results
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
                    <div className="flex items-center gap-2.5">
                      {info?.avatarUrl ? (
                        <img
                          src={info.avatarUrl}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-[0.65rem] font-medium text-on-surface-variant">
                          {(info?.name ?? r.extId).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-on-surface leading-tight">
                          {info?.name ?? r.extId}
                        </p>
                        <p className="text-[0.72rem] text-on-surface-variant/60">{r.extId}</p>
                      </div>
                    </div>
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
