"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { WeightTierSection } from "./weight-tier-section";
import { IncentiveSection } from "./incentive-section";
import { PetrolSection } from "./petrol-section";
import type { StaffDispatcher } from "@/lib/db/staff";

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

function deriveGenderClient(icNo: string): Gender {
  const lastDigit = parseInt(icNo.slice(-1));
  if (isNaN(lastDigit)) return "UNKNOWN";
  return lastDigit % 2 !== 0 ? "MALE" : "FEMALE";
}

interface WeightTier {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface IncentiveRule {
  orderThreshold: number;
  incentiveAmount: number;
}

interface PetrolRule {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
}

interface DispatcherDrawerProps {
  dispatcher: StaffDispatcher;
  onClose: () => void;
  onCompletenessChange: (dispatcherId: string, isComplete: boolean) => void;
}

export function DispatcherDrawer({ dispatcher, onClose, onCompletenessChange }: DispatcherDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useClickOutside(drawerRef, onClose);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Local form state — initialized from inline data (no fetch needed)
  const [icNo, setIcNo] = useState(dispatcher.rawIcNo);
  const [weightTiers, setWeightTiers] = useState<WeightTier[]>(dispatcher.weightTiers);
  const [incentiveRule, setIncentiveRule] = useState<IncentiveRule | null>(dispatcher.incentiveRule);
  const [petrolRule, setPetrolRule] = useState<PetrolRule | null>(dispatcher.petrolRule);

  // Refs for revert on error
  const lastSavedIcNo = useRef(dispatcher.rawIcNo);
  const lastSavedWeightTiers = useRef<WeightTier[]>(dispatcher.weightTiers);
  const lastSavedIncentiveRule = useRef<IncentiveRule | null>(dispatcher.incentiveRule);
  const lastSavedPetrolRule = useRef<PetrolRule | null>(dispatcher.petrolRule);

  // Debounce timer
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form state when switching dispatchers
  useEffect(() => {
    setIcNo(dispatcher.rawIcNo);
    setWeightTiers(dispatcher.weightTiers);
    setIncentiveRule(dispatcher.incentiveRule);
    setPetrolRule(dispatcher.petrolRule);
    setSaveStatus("idle");
    lastSavedIcNo.current = dispatcher.rawIcNo;
    lastSavedWeightTiers.current = dispatcher.weightTiers;
    lastSavedIncentiveRule.current = dispatcher.incentiveRule;
    lastSavedPetrolRule.current = dispatcher.petrolRule;
  }, [dispatcher.id, dispatcher.rawIcNo, dispatcher.weightTiers, dispatcher.incentiveRule, dispatcher.petrolRule]);

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Save function
  const save = useCallback(async (payload: Record<string, unknown>) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/staff/${dispatcher.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      setSaveStatus("saved");
      onCompletenessChange(dispatcher.id, result.isComplete);

      // Update last saved refs
      if (payload.icNo !== undefined) lastSavedIcNo.current = payload.icNo as string;
      if (payload.weightTiers) lastSavedWeightTiers.current = payload.weightTiers as WeightTier[];
      if (payload.incentiveRule) lastSavedIncentiveRule.current = payload.incentiveRule as IncentiveRule;
      if (payload.petrolRule) lastSavedPetrolRule.current = payload.petrolRule as PetrolRule;

      toast.success("Changes saved", { duration: 3000 });
    } catch {
      setSaveStatus("error");
      toast.error("Failed to save. Please try again.");
      // Revert to last saved
      if (payload.icNo !== undefined) setIcNo(lastSavedIcNo.current);
      if (payload.weightTiers) setWeightTiers(lastSavedWeightTiers.current);
      if (payload.incentiveRule) setIncentiveRule(lastSavedIncentiveRule.current);
      if (payload.petrolRule) setPetrolRule(lastSavedPetrolRule.current);
    }
  }, [dispatcher.id, onCompletenessChange]);

  // Debounced save wrapper
  const debouncedSave = useCallback((payload: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(payload), 600);
  }, [save]);

  // Section handlers
  function handleIcBlur() {
    if (icNo !== lastSavedIcNo.current) {
      debouncedSave({ icNo });
    }
  }

  function handleWeightTiersUpdate(tiers: WeightTier[]) {
    setWeightTiers(tiers);
    debouncedSave({ weightTiers: tiers });
  }

  function handleIncentiveUpdate(rule: IncentiveRule) {
    setIncentiveRule(rule);
    debouncedSave({ incentiveRule: rule });
  }

  function handlePetrolUpdate(rule: PetrolRule) {
    setPetrolRule(rule);
    debouncedSave({ petrolRule: rule });
  }

  // Live gender preview
  const liveGender = deriveGenderClient(icNo);
  const genderLabel = liveGender === "MALE" ? "Male" : liveGender === "FEMALE" ? "Female" : "—";
  const ringColor =
    liveGender === "MALE"
      ? "var(--color-brand)"
      : liveGender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";

  // Completeness badge
  const isComplete =
    icNo.length > 0 &&
    weightTiers.length === 3 &&
    !!incentiveRule &&
    incentiveRule.incentiveAmount > 0 &&
    !!petrolRule;

  // Avatar initials
  const initials = dispatcher.name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-on-surface/30" />
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 bottom-0 w-120 max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/20">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-low text-[0.84rem] font-semibold text-on-surface-variant shrink-0"
            style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface truncate">{dispatcher.name}</h2>
              {!isComplete && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-600 bg-amber-50 rounded-lg">
                  Incomplete
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[0.75rem] text-on-surface-variant">{dispatcher.extId}</p>
              <span className="inline-block px-1.5 py-0.5 text-[0.68rem] font-medium text-on-surface-variant bg-surface-low rounded-lg">
                {dispatcher.branchCode}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-6 overflow-y-auto space-y-7">
          {/* Identity */}
          <section>
            <h3 className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-3">
              Identity
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-[0.68rem] text-on-surface-variant mb-1">IC Number</label>
                <input
                  type="text"
                  value={icNo}
                  onChange={(e) => setIcNo(e.target.value)}
                  onBlur={handleIcBlur}
                  placeholder="e.g. 990101145678"
                  className="w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums font-mono bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.75rem] text-on-surface-variant">Gender:</span>
                <span className={`text-[0.84rem] font-medium ${
                  liveGender === "MALE" ? "text-brand" : liveGender === "FEMALE" ? "text-pink-500" : "text-on-surface-variant"
                }`}>
                  {genderLabel}
                </span>
              </div>
            </div>
          </section>

          {/* Weight Tiers */}
          <WeightTierSection tiers={weightTiers} onUpdate={handleWeightTiersUpdate} />

          {/* Incentive */}
          <IncentiveSection rule={incentiveRule} onUpdate={handleIncentiveUpdate} />

          {/* Petrol */}
          <PetrolSection rule={petrolRule} onUpdate={handlePetrolUpdate} />
        </div>

        {/* Footer — save indicator */}
        <div className="px-6 py-3 border-t border-outline-variant/20">
          {saveStatus === "saved" && (
            <div className="flex items-center gap-1.5 text-[0.75rem] text-green-600">
              <Check size={14} />
              <span>All changes saved</span>
            </div>
          )}
          {saveStatus === "saving" && (
            <div className="flex items-center gap-1.5 text-[0.75rem] text-on-surface-variant">
              <div className="w-3 h-3 border-[1.5px] border-on-surface-variant border-t-transparent rounded-full animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {saveStatus === "idle" && (
            <div className="h-5" />
          )}
          {saveStatus === "error" && (
            <div className="text-[0.75rem] text-critical">Save failed — changes reverted</div>
          )}
        </div>
      </div>
    </div>
  );
}
