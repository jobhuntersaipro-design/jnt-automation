"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Settings } from "lucide-react";
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
 * Calculator-style input: digits shift left as you type.
 * Uses dots (.) for decimal separator.
 */
function CalcInput({
  value,
  onSave,
}: {
  value: number;
  onSave: (val: number) => void;
}) {
  const [cents, setCents] = useState(Math.round(value * 100));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setCents(Math.round(value * 100));
  }, [value]);

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

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      readOnly
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={() => setFocused(true)}
      className={`w-20 px-2 py-1 text-[0.82rem] tabular-nums text-right rounded-md border bg-surface transition-colors cursor-text ${
        focused
          ? "border-brand outline-none ring-1 ring-brand/30"
          : "border-outline-variant/30"
      }`}
    />
  );
}

/**
 * Weight tier popover — inline in the preview table.
 */
function TierPopover({
  dispatcherName,
  tiers,
  onApply,
  onClose,
}: {
  dispatcherName: string;
  tiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }>;
  onApply: (tiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }>) => void;
  onClose: () => void;
}) {
  const [localTiers, setLocalTiers] = useState(tiers.map((t) => ({ ...t })));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleFieldChange = (tierIdx: number, field: "minWeight" | "maxWeight" | "commission", val: string) => {
    const v = val.replace(",", ".");
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
    setLocalTiers((prev) =>
      prev.map((t, i) => {
        if (i !== tierIdx) return t;
        const parsed = v === "" ? 0 : parseFloat(v) || 0;
        if (field === "maxWeight") return { ...t, maxWeight: v === "" ? null : parsed };
        return { ...t, [field]: parsed };
      }),
    );
  };

  const inputCls = "w-14 px-1.5 py-1 text-[0.75rem] tabular-nums text-center bg-white border border-outline-variant/30 rounded-md text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40";

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-2 z-50 bg-white rounded-lg shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-outline-variant/20 p-4 w-80"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[0.75rem] font-semibold text-on-surface mb-2">
        Weight Tiers — {dispatcherName}
      </p>
      {/* Column labels */}
      <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 mb-1">
        <span />
        <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Min (kg)</span>
        <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Max (kg)</span>
        <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Rate (RM)</span>
      </div>
      <div className="space-y-1.5">
        {localTiers.map((tier, i) => (
          <div key={tier.tier} className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 items-center">
            <span className="text-[0.7rem] font-semibold text-on-surface-variant text-center">T{tier.tier}</span>
            <input
              type="text"
              inputMode="decimal"
              value={tier.minWeight}
              disabled={i === 0}
              onChange={(e) => handleFieldChange(i, "minWeight", e.target.value)}
              className={`${inputCls} ${i === 0 ? "opacity-40 bg-surface" : ""}`}
            />
            {tier.maxWeight === null ? (
              <div className="text-[0.78rem] text-on-surface-variant/50 text-center">∞</div>
            ) : (
              <input
                type="text"
                inputMode="decimal"
                value={tier.maxWeight}
                onChange={(e) => handleFieldChange(i, "maxWeight", e.target.value)}
                className={inputCls}
              />
            )}
            <input
              type="text"
              inputMode="decimal"
              value={tier.commission}
              onChange={(e) => handleFieldChange(i, "commission", e.target.value)}
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-outline-variant/15">
        <button
          onClick={onClose}
          className="px-3 py-1 text-[0.75rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(localTiers)}
          className="px-3 py-1 text-[0.75rem] font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
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
  const [tierPopover, setTierPopover] = useState<string | null>(null);

  const handleFieldChange = useCallback(
    async (dispatcherId: string, field: "penalty" | "advance" | "incentive" | "petrolSubsidy", value: number) => {
      const result = results.find((r) => r.dispatcherId === dispatcherId);
      if (!result) return;

      const penalty = field === "penalty" ? value : result.penalty;
      const advance = field === "advance" ? value : result.advance;
      const incentive = field === "incentive" ? value : result.incentive;
      const petrolSubsidy = field === "petrolSubsidy" ? value : result.petrolSubsidy;

      setUpdating(dispatcherId);
      try {
        const res = await fetch(`/api/upload/${uploadId}/preview`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatcherId, penalty, advance, incentive, petrolSubsidy }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Failed to update");
          return;
        }

        const { updatedNetSalary, updatedSummary } = await res.json();

        const updated = results.map((r) =>
          r.dispatcherId === dispatcherId
            ? { ...r, penalty, advance, incentive, petrolSubsidy, netSalary: updatedNetSalary }
            : r,
        );
        onResultsUpdate(updated);
        onSummaryUpdate(updatedSummary);
      } catch {
        toast.error("Failed to update");
      } finally {
        setUpdating(null);
      }
    },
    [results, uploadId, onResultsUpdate, onSummaryUpdate],
  );

  const handleTierApply = useCallback(
    async (dispatcherId: string, newTiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }>) => {
      setTierPopover(null);
      setUpdating(dispatcherId);
      try {
        const res = await fetch(`/api/upload/${uploadId}/preview`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispatcherId, weightTiers: newTiers }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Failed to update tiers");
          return;
        }

        const { updatedBaseSalary, updatedNetSalary, updatedSummary } = await res.json();

        const updated = results.map((r) =>
          r.dispatcherId === dispatcherId
            ? { ...r, baseSalary: updatedBaseSalary, netSalary: updatedNetSalary, weightTiersSnapshot: newTiers }
            : r,
        );
        onResultsUpdate(updated);
        onSummaryUpdate(updatedSummary);
      } catch {
        toast.error("Failed to update tiers");
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
              <th className="py-3 px-3 font-medium text-right">Net Salary</th>
              <th className="py-3 px-3 font-medium text-center w-12">Tiers</th>
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
                  <td className="py-2.5 px-3 text-right">
                    <CalcInput
                      value={r.incentive}
                      onSave={(val) => handleFieldChange(r.dispatcherId, "incentive", val)}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <CalcInput
                      value={r.petrolSubsidy}
                      onSave={(val) => handleFieldChange(r.dispatcherId, "petrolSubsidy", val)}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <CalcInput
                      value={r.penalty}
                      onSave={(val) => handleFieldChange(r.dispatcherId, "penalty", val)}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <CalcInput
                      value={r.advance}
                      onSave={(val) => handleFieldChange(r.dispatcherId, "advance", val)}
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-brand">
                    {formatRM(r.netSalary)}
                  </td>
                  <td className="py-2.5 px-3 text-center relative">
                    <button
                      onClick={() => setTierPopover(tierPopover === r.dispatcherId ? null : r.dispatcherId)}
                      className="p-1.5 text-on-surface-variant/50 hover:text-brand hover:bg-brand/5 rounded-md transition-colors"
                      title="Edit weight tiers"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    {tierPopover === r.dispatcherId && (
                      <TierPopover
                        dispatcherName={info?.name ?? r.extId}
                        tiers={r.weightTiersSnapshot}
                        onApply={(tiers) => handleTierApply(r.dispatcherId, tiers)}
                        onClose={() => setTierPopover(null)}
                      />
                    )}
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
