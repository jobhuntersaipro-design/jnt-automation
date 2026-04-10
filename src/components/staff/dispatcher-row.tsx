"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Pin, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { StaffDispatcher } from "@/lib/db/staff";

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

function deriveGenderClient(icNo: string): Gender {
  const lastDigit = parseInt(icNo.slice(-1));
  if (isNaN(lastDigit)) return "UNKNOWN";
  return lastDigit % 2 !== 0 ? "MALE" : "FEMALE";
}

const TIER_DEFAULTS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null as number | null, commission: 2.2 },
];

function validateIc(ic: string): string | null {
  if (!ic) return null;
  if (!/^\d*$/.test(ic)) return "Digits only";
  if (ic.length !== 12) return "Must be 12 digits";
  return null;
}

/** Grid: name | branch | IC | tiers | sep | incentive(3) | sep | petrol(3) | status | actions */
export const ROW_GRID = "grid grid-cols-[1.2fr_0.55fr_1fr_1.1fr_4px_0.4fr_0.6fr_0.6fr_4px_0.4fr_0.6fr_0.6fr_0.4fr_0.4fr] items-center gap-x-1.5";

interface DispatcherRowProps {
  dispatcher: StaffDispatcher;
  onPin: (e: React.MouseEvent, d: StaffDispatcher) => void;
  onDelete: (d: StaffDispatcher) => void;
  onFieldSaved: (dispatcherId: string, isComplete: boolean) => void;
}

const INPUT_CLASS =
  "w-full px-1.5 py-1 text-[0.78rem] tabular-nums text-center bg-transparent border border-transparent rounded-[0.25rem] text-on-surface hover:border-outline-variant/40 focus:border-brand/40 focus:bg-white focus:outline-none transition-colors";

export function DispatcherRow({ dispatcher, onPin, onDelete, onFieldSaved }: DispatcherRowProps) {
  const [icNo, setIcNo] = useState(dispatcher.rawIcNo);
  const [icError, setIcError] = useState<string | null>(null);
  const [orderThreshold, setOrderThreshold] = useState(dispatcher.incentiveRule?.orderThreshold ?? 2000);
  const [incentiveAmount, setIncentiveAmount] = useState(dispatcher.incentiveRule?.incentiveAmount ?? 0);
  const [isEligible, setIsEligible] = useState(dispatcher.petrolRule?.isEligible ?? false);
  const [dailyThreshold, setDailyThreshold] = useState(dispatcher.petrolRule?.dailyThreshold ?? 70);
  const [subsidyAmount, setSubsidyAmount] = useState(dispatcher.petrolRule?.subsidyAmount ?? 15);
  const [weightTiers, setWeightTiers] = useState(
    dispatcher.weightTiers.length === 3 ? dispatcher.weightTiers : TIER_DEFAULTS,
  );

  // Tier popover
  const [editingTier, setEditingTier] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (editingTier === null) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingTier(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingTier]);

  const save = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/staff/${dispatcher.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      onFieldSaved(dispatcher.id, result.isComplete);
    } catch {
      toast.error("Failed to save. Please try again.");
    }
  }, [dispatcher.id, onFieldSaved]);

  function handleIcBlur() {
    const err = validateIc(icNo);
    setIcError(err);
    if (!err && icNo !== dispatcher.rawIcNo) {
      save({ icNo });
    }
  }

  function handleIncentiveBlur() {
    save({ incentiveRule: { orderThreshold, incentiveAmount } });
  }

  function handlePetrolToggle() {
    const next = !isEligible;
    setIsEligible(next);
    save({ petrolRule: { isEligible: next, dailyThreshold, subsidyAmount } });
  }

  function handlePetrolBlur() {
    save({ petrolRule: { isEligible, dailyThreshold, subsidyAmount } });
  }

  function handleTierFieldChange(tierIndex: number, field: "minWeight" | "maxWeight" | "commission", value: string) {
    setWeightTiers((prev) => prev.map((t, i) => {
      if (i !== tierIndex) return t;
      const num = parseFloat(value);
      return { ...t, [field]: isNaN(num) ? 0 : num };
    }));
  }

  function handleTierBlur() {
    save({ weightTiers });
  }

  const liveGender = deriveGenderClient(icNo);
  const ringColor =
    liveGender === "MALE"
      ? "var(--color-brand)"
      : liveGender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";

  const initials = dispatcher.name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  function Toggle({ checked, onChange, color }: { checked: boolean; onChange: () => void; color: string }) {
    return (
      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={onChange}
          className="relative w-8 h-4.5 rounded-full transition-colors"
          style={{ backgroundColor: checked ? color : "rgba(195, 198, 214, 0.4)" }}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-3.5" : ""
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div className={`${ROW_GRID} px-5 py-[0.6rem] ${
      dispatcher.isPinned ? "bg-brand/4 hover:bg-brand/8" : "hover:bg-surface-hover"
    } transition-colors`}>
      {/* Dispatcher */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-low text-[0.7rem] font-semibold text-on-surface-variant shrink-0"
          style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-[0.82rem] font-medium text-on-surface truncate">{dispatcher.name}</p>
          <p className="text-[0.66rem] text-on-surface-variant">{dispatcher.extId}</p>
        </div>
      </div>

      {/* Branch */}
      <span className="text-[0.78rem] font-medium text-on-surface-variant text-center">{dispatcher.branchCode}</span>

      {/* IC No */}
      <div className="self-center">
        <input
          type="text"
          value={icNo}
          onChange={(e) => { setIcNo(e.target.value); setIcError(null); }}
          onBlur={handleIcBlur}
          onClick={(e) => e.stopPropagation()}
          placeholder="—"
          maxLength={12}
          className={`${INPUT_CLASS} font-mono ${icError ? "border-critical/50!" : ""}`}
        />
        {icError && (
          <p className="text-[0.62rem] text-critical mt-0.5 text-center">{icError}</p>
        )}
      </div>

      {/* Weight Tier Chips */}
      <div className="relative group/tiers">
        <button
          onClick={(e) => { e.stopPropagation(); setEditingTier(editingTier === null ? 0 : null); }}
          className="flex items-center gap-1 w-full justify-center cursor-pointer"
        >
          {weightTiers.map((tier) => (
            <span
              key={tier.tier}
              className="px-1.5 py-0.5 text-[0.7rem] tabular-nums font-medium bg-surface-low text-on-surface-variant rounded-lg"
            >
              RM{tier.commission.toFixed(2)}
            </span>
          ))}
          <Pencil size={11} className="text-on-surface-variant/0 group-hover/tiers:text-on-surface-variant/50 transition-colors ml-0.5 shrink-0" />
        </button>

        {/* Tier edit popover — all 3 tiers at once */}
        {editingTier !== null && (
          <div
            ref={popoverRef}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-outline-variant/20 p-3.5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[0.68rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] mb-2.5">
              Weight Tiers
            </p>
            {/* Column labels */}
            <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-x-2 items-center mb-1">
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Tier</span>
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Min (kg)</span>
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Max (kg)</span>
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Rate (RM)</span>
            </div>
            <div className="space-y-1.5">
              {weightTiers.map((tier, i) => (
                <div key={tier.tier} className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-x-2 items-center">
                  <span className="text-[0.7rem] font-semibold text-on-surface-variant text-center">T{tier.tier}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tier.minWeight}
                    disabled={i === 0}
                    onChange={(e) => handleTierFieldChange(i, "minWeight", e.target.value)}
                    onBlur={handleTierBlur}
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:opacity-40 disabled:bg-surface-low"
                  />
                  {i === 2 ? (
                    <div className="w-full px-2 py-1 text-[0.78rem] text-on-surface-variant/50 text-center border border-transparent">∞</div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={tier.maxWeight ?? ""}
                      onChange={(e) => handleTierFieldChange(i, "maxWeight", e.target.value)}
                      onBlur={handleTierBlur}
                      className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />
                  )}
                  <input
                    type="number"
                    step="0.01"
                    value={tier.commission}
                    onChange={(e) => handleTierFieldChange(i, "commission", e.target.value)}
                    onBlur={handleTierBlur}
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Separator ── */}
      <div className="h-6 rounded-full" style={{ backgroundColor: "rgba(18, 185, 129, 0.15)" }} />

      {/* ── Incentive: Eligible, Min Orders, Amount ── */}
      <Toggle color="#12B981" checked={incentiveAmount > 0} onChange={() => {
        const next = incentiveAmount > 0 ? 0 : 200;
        setIncentiveAmount(next);
        save({ incentiveRule: { orderThreshold, incentiveAmount: next } });
      }} />

      {incentiveAmount > 0 ? (
        <input
          type="number"
          value={orderThreshold}
          onChange={(e) => setOrderThreshold(parseInt(e.target.value) || 0)}
          onBlur={handleIncentiveBlur}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {incentiveAmount > 0 ? (
        <input
          type="number"
          step="0.01"
          value={incentiveAmount}
          onChange={(e) => setIncentiveAmount(parseFloat(e.target.value) || 0)}
          onBlur={handleIncentiveBlur}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {/* ── Separator ── */}
      <div className="h-6 rounded-full" style={{ backgroundColor: "rgba(251, 192, 36, 0.2)" }} />

      {/* ── Petrol: Eligible, Min Orders, Amount ── */}
      <Toggle color="#FBC024" checked={isEligible} onChange={handlePetrolToggle} />

      {isEligible ? (
        <input
          type="number"
          value={dailyThreshold}
          onChange={(e) => setDailyThreshold(parseInt(e.target.value) || 0)}
          onBlur={handlePetrolBlur}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {isEligible ? (
        <input
          type="number"
          step="0.01"
          value={subsidyAmount}
          onChange={(e) => setSubsidyAmount(parseFloat(e.target.value) || 0)}
          onBlur={handlePetrolBlur}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {/* Status */}
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-1 text-[0.72rem] font-medium ${dispatcher.isComplete ? "text-green-600" : "text-amber-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dispatcher.isComplete ? "bg-green-500" : "bg-amber-400"}`} />
          {dispatcher.isComplete ? "OK" : "Inc."}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 justify-center">
        <button
          onClick={(e) => onPin(e, dispatcher)}
          className={`p-1 rounded-lg transition-all ${
            dispatcher.isPinned
              ? "text-brand hover:bg-brand/10"
              : "text-on-surface-variant hover:text-brand hover:bg-brand/10"
          }`}
          title={dispatcher.isPinned ? "Unpin" : "Pin to top"}
        >
          <Pin size={12} fill={dispatcher.isPinned ? "currentColor" : "none"} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(dispatcher); }}
          className="p-1 rounded-lg text-on-surface-variant hover:text-critical hover:bg-critical/5 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
