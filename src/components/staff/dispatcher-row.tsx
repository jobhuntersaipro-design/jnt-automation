"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Pin, Trash2, Pencil, Clock } from "lucide-react";
import { toast } from "sonner";
import type { StaffDispatcher, AgentDefaults } from "@/lib/db/staff";
import { BranchChip } from "@/components/ui/branch-chip";
import { DispatcherAvatar } from "./dispatcher-avatar";

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

const BONUS_TIER_DEFAULTS = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null as number | null, commission: 3.3 },
];

function validateIc(ic: string): string | null {
  if (!ic) return null; // IC is optional
  if (!/^\d*$/.test(ic)) return "Digits only";
  if (ic.length !== 12) return "Must be 12 digits";
  return null;
}

/** Decimal input — "cents" mode auto-formats as RM (typing 521 → 5.21) with +/- buttons */
function DecimalInput({ value, onChange, className, onClick, cents }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  cents?: boolean;
}) {
  const [raw, setRaw] = useState(cents ? Math.round(value * 100).toString() : String(value));
  const [focused, setFocused] = useState(false);

  const formatCents = (digits: string) => {
    const n = parseInt(digits || "0", 10);
    return (n / 100).toFixed(2);
  };

  const display = cents
    ? (focused ? formatCents(raw) : value.toFixed(2))
    : (focused ? raw : String(value));

  if (!cents) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          const v = e.target.value.replace(",", ".");
          if (v === "" || /^\d*\.?\d*$/.test(v)) {
            setRaw(v);
            onChange(v === "" ? 0 : parseFloat(v) || 0);
          }
        }}
        onFocus={() => { setFocused(true); setRaw(String(value)); }}
        onBlur={() => setFocused(false)}
        onClick={onClick}
        className={className}
      />
    );
  }

  const step = (dir: 1 | -1) => {
    const next = Math.max(0, Math.round((value + dir * 0.01) * 100) / 100);
    onChange(next);
    setRaw(Math.round(next * 100).toString());
  };

  return (
    <div className="relative group/decimal" onClick={onClick}>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setRaw(digits);
          onChange(parseInt(digits || "0", 10) / 100);
        }}
        onFocus={() => { setFocused(true); setRaw(Math.round(value * 100).toString()); }}
        onBlur={() => setFocused(false)}
        className={className}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col opacity-0 group-hover/decimal:opacity-100 transition-opacity">
        <button type="button" onClick={(e) => { e.stopPropagation(); step(1); }} className="flex-1 px-1 text-[0.55rem] text-on-surface-variant hover:text-brand">▲</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); step(-1); }} className="flex-1 px-1 text-[0.55rem] text-on-surface-variant hover:text-brand">▼</button>
      </div>
    </div>
  );
}

/** Grid: check | name | branch | IC | tiers | sep | bonusTierEarnings(3) | sep | petrol(3) | status | actions
 *
 * Bonus tier Amount cell mirrors the Weight Tier cell width (1.1fr) because
 * both render 3 RM-rate chips side by side — the previous 0.6fr was too
 * narrow, so CSS Grid expanded the cell at min-content (chip width),
 * pushing the Petrol section right and breaking alignment with the row 1
 * group labels and row 2 sub-headers (which contain only short text and
 * fit at the fr-allocated widths).
 *
 * Petrol Amount cell uses 1.1fr (same as bonus) so the BONUS TIER and
 * PETROL group-underline widths above match exactly. Petrol's content is
 * just a single RM input so the extra space is harmless — symmetry is
 * what the eye reads.
 */
export const ROW_GRID = "grid grid-cols-[1.6rem_1.2fr_0.55fr_1fr_1.1fr_4px_0.4fr_0.6fr_1.1fr_4px_0.4fr_0.6fr_1.1fr_0.4fr_0.5fr] items-center gap-x-1.5 min-w-[1180px]";

/**
 * Portaled popover that anchors to a button. Escapes the table's
 * `overflow-x-auto` clip so tier editors remain visible and interactive.
 */
function TierPopover({
  open,
  anchorRef,
  onClose,
  width,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const preferredLeft = rect.left + rect.width / 2 - width / 2;
      const clampedLeft = Math.min(
        Math.max(preferredLeft, 8),
        window.innerWidth - width - 8,
      );
      setPos({ top: rect.bottom + 6, left: clampedLeft });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, anchorRef, onClose]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width }}
      className="z-50 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-outline-variant/20 p-3.5"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

interface DispatcherRowProps {
  dispatcher: StaffDispatcher;
  dataVersion: number;
  defaults: AgentDefaults;
  saveTrigger: number;
  isNew?: boolean;
  isChecked?: boolean;
  onCheck: (dispatcherId: string, checked: boolean) => void;
  onPin: (e: React.MouseEvent, d: StaffDispatcher) => void;
  onDelete: (d: StaffDispatcher) => void;
  onFieldSaved: (dispatcherId: string, isComplete: boolean) => void;
  onAvatarChange: (dispatcherId: string, avatarUrl: string | null) => void;
  onAcknowledge: (dispatcherId: string) => void;
  onErrorChange: (dispatcherId: string, hasError: boolean) => void;
  onOpenDrawer: (d: StaffDispatcher) => void;
  onDirtyChange: (dispatcherId: string, isDirty: boolean) => void;
}

const INPUT_CLASS =
  "w-full px-1.5 py-1 text-[0.78rem] tabular-nums text-center bg-transparent border border-dashed border-transparent rounded-[0.25rem] text-on-surface hover:border-outline-variant/50 hover:bg-brand/5 focus:border-brand/40 focus:border-solid focus:bg-white focus:outline-none transition-all";

export function DispatcherRow({ dispatcher, dataVersion, defaults, saveTrigger, isNew, isChecked, onCheck, onPin, onDelete, onFieldSaved, onAvatarChange, onAcknowledge, onErrorChange, onOpenDrawer, onDirtyChange }: DispatcherRowProps) {
  const [avatarUrl, setAvatarUrl] = useState(dispatcher.avatarUrl);

  // Avatar can be mutated from the drawer too — resync whenever the prop
  // changes, not just on full server refresh (dataVersion).
  useEffect(() => {
    setAvatarUrl(dispatcher.avatarUrl);
  }, [dispatcher.avatarUrl]);

  const [icNo, setIcNo] = useState(dispatcher.rawIcNo);
  const [icError, setIcError] = useState<string | null>(null);
  const [branchCode, setBranchCode] = useState(dispatcher.branchCode);
  const [orderThreshold, setOrderThreshold] = useState(dispatcher.incentiveRule?.orderThreshold ?? 2000);
  const [bonusTiers, setBonusTiers] = useState(
    dispatcher.bonusTiers.length === 3 ? dispatcher.bonusTiers : BONUS_TIER_DEFAULTS,
  );
  const [incentiveEnabled, setBonusTierEnabled] = useState((dispatcher.incentiveRule?.orderThreshold ?? 0) > 0);
  const [isEligible, setIsEligible] = useState(dispatcher.petrolRule?.isEligible ?? false);
  const [dailyThreshold, setDailyThreshold] = useState(dispatcher.petrolRule?.dailyThreshold ?? 70);
  const [subsidyAmount, setSubsidyAmount] = useState(dispatcher.petrolRule?.subsidyAmount ?? 15);
  const [weightTiers, setWeightTiers] = useState(
    dispatcher.weightTiers.length === 3 ? dispatcher.weightTiers : TIER_DEFAULTS,
  );

  // Re-sync local state only when server data refreshes (dataVersion changes)
  useEffect(() => {
    setIcNo(dispatcher.rawIcNo);
    setAvatarUrl(dispatcher.avatarUrl);
    setBranchCode(dispatcher.branchCode);
    setOrderThreshold(dispatcher.incentiveRule?.orderThreshold ?? 2000);
    setBonusTiers(
      dispatcher.bonusTiers.length === 3 ? dispatcher.bonusTiers : BONUS_TIER_DEFAULTS,
    );
    setBonusTierEnabled((dispatcher.incentiveRule?.orderThreshold ?? 0) > 0);
    setIsEligible(dispatcher.petrolRule?.isEligible ?? false);
    setDailyThreshold(dispatcher.petrolRule?.dailyThreshold ?? 70);
    setSubsidyAmount(dispatcher.petrolRule?.subsidyAmount ?? 15);
    setWeightTiers(dispatcher.weightTiers.length === 3 ? dispatcher.weightTiers : TIER_DEFAULTS);
    setIcError(null);
    onErrorChange(dispatcher.id, false);
    // Reset baseline to match new server state
    baselineRef.current = {
      icNo: dispatcher.rawIcNo,
      branchCode: dispatcher.branchCode,
      incentiveEnabled: (dispatcher.incentiveRule?.orderThreshold ?? 0) > 0,
      orderThreshold: dispatcher.incentiveRule?.orderThreshold ?? 2000,
      bonusTiers: dispatcher.bonusTiers.length === 3 ? dispatcher.bonusTiers : BONUS_TIER_DEFAULTS,
      isEligible: dispatcher.petrolRule?.isEligible ?? false,
      dailyThreshold: dispatcher.petrolRule?.dailyThreshold ?? 70,
      subsidyAmount: dispatcher.petrolRule?.subsidyAmount ?? 15,
      weightTiers: dispatcher.weightTiers.length === 3 ? dispatcher.weightTiers : TIER_DEFAULTS,
    };
    setBaselineVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Counter to force isDirty recalculation when baseline changes (refs don't trigger useMemo)
  const [baselineVersion, setBaselineVersion] = useState(0);

  // Baseline for dirty tracking — updated on save success and server refresh
  const baselineRef = useRef({
    icNo: dispatcher.rawIcNo,
    branchCode: dispatcher.branchCode,
    incentiveEnabled: (dispatcher.incentiveRule?.orderThreshold ?? 0) > 0,
    orderThreshold: dispatcher.incentiveRule?.orderThreshold ?? 2000,
    bonusTiers: dispatcher.bonusTiers.length === 3 ? dispatcher.bonusTiers : BONUS_TIER_DEFAULTS,
    isEligible: dispatcher.petrolRule?.isEligible ?? false,
    dailyThreshold: dispatcher.petrolRule?.dailyThreshold ?? 70,
    subsidyAmount: dispatcher.petrolRule?.subsidyAmount ?? 15,
    weightTiers: dispatcher.weightTiers.length === 3 ? dispatcher.weightTiers : TIER_DEFAULTS,
  });

  // Dirty tracking — compare against baseline (last saved or server-refreshed state)
  const isDirty = useMemo(() => {
    const b = baselineRef.current;
    if (icNo !== b.icNo) return true;
    if (branchCode !== b.branchCode) return true;
    if (incentiveEnabled !== b.incentiveEnabled) return true;
    if (incentiveEnabled && orderThreshold !== b.orderThreshold) return true;
    if (incentiveEnabled) {
      for (let i = 0; i < 3; i++) {
        if (b.bonusTiers[i].commission !== bonusTiers[i].commission) return true;
      }
    }
    if (isEligible !== b.isEligible) return true;
    if (dailyThreshold !== b.dailyThreshold) return true;
    if (subsidyAmount !== b.subsidyAmount) return true;
    for (let i = 0; i < 3; i++) {
      if (b.weightTiers[i].commission !== weightTiers[i].commission) return true;
      if (b.weightTiers[i].minWeight !== weightTiers[i].minWeight) return true;
      if (b.weightTiers[i].maxWeight !== weightTiers[i].maxWeight) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icNo, branchCode, orderThreshold, bonusTiers, incentiveEnabled, isEligible, dailyThreshold, subsidyAmount, weightTiers, baselineVersion]);

  // Report dirty state to parent
  useEffect(() => {
    onDirtyChange(dispatcher.id, isDirty);
  }, [isDirty, dispatcher.id, onDirtyChange]);

  // Tier popover (anchor + portal wiring). The outside-click + positioning
  // is handled by TierPopover itself.
  const [editingTier, setEditingTier] = useState<number | null>(null);
  const weightTierAnchorRef = useRef<HTMLButtonElement>(null);
  const bonusTierAnchorRef = useRef<HTMLButtonElement>(null);

  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    // Validate IC
    if (icNo && validateIc(icNo)) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (icNo !== dispatcher.rawIcNo) payload.icNo = icNo;
      if (branchCode !== dispatcher.branchCode) payload.branchCode = branchCode;
      payload.weightTiers = weightTiers;
      payload.incentiveRule = {
        orderThreshold: incentiveEnabled ? orderThreshold : 0,
      };
      payload.bonusTiers = bonusTiers;
      payload.petrolRule = { isEligible, dailyThreshold, subsidyAmount };

      const res = await fetch(`/api/staff/${dispatcher.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const result = await res.json();
      // Update baseline so isDirty flips to false immediately
      baselineRef.current = {
        icNo,
        branchCode,
        incentiveEnabled,
        orderThreshold: incentiveEnabled ? orderThreshold : 0,
        bonusTiers,
        isEligible,
        dailyThreshold,
        subsidyAmount,
        weightTiers,
      };
      setBaselineVersion((v) => v + 1);
      onFieldSaved(dispatcher.id, result.isComplete);
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dispatcher.id, dispatcher.rawIcNo, dispatcher.branchCode, icNo, branchCode, weightTiers, incentiveEnabled, orderThreshold, bonusTiers, isEligible, dailyThreshold, subsidyAmount, onFieldSaved]);

  // Save on trigger (when parent Save button is clicked)
  const prevTrigger = useRef(0);
  useEffect(() => {
    if (saveTrigger > 0 && saveTrigger !== prevTrigger.current) {
      prevTrigger.current = saveTrigger;
      if (isDirty) {
        save();
      }
    }
  }, [saveTrigger, isDirty, save]);

  function handleIcChange(val: string) {
    setIcNo(val);
    const err = validateIc(val);
    setIcError(err);
    onErrorChange(dispatcher.id, !!err);
  }

  function handleTierFieldChange(tierIndex: number, field: "minWeight" | "maxWeight" | "commission", value: string) {
    const cleaned = value.replace(",", ".");
    setWeightTiers((prev) => prev.map((t, i) => {
      if (i !== tierIndex) return t;
      const num = parseFloat(cleaned);
      return { ...t, [field]: isNaN(num) ? 0 : num };
    }));
  }

  function handleBonusTierRateChange(tierIndex: number, value: string) {
    const cleaned = value.replace(",", ".");
    setBonusTiers((prev) => prev.map((t, i) => {
      if (i !== tierIndex) return t;
      const num = parseFloat(cleaned);
      return { ...t, commission: isNaN(num) ? 0 : num };
    }));
  }

  const [editingBonusTier, setEditingBonusTier] = useState(false);

  const liveGender = deriveGenderClient(icNo);
  const ringColor =
    liveGender === "MALE"
      ? "var(--color-brand)"
      : liveGender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";

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
    } transition-colors group/row`}>
      {/* Checkbox */}
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={!!isChecked}
          onChange={(e) => { e.stopPropagation(); onCheck(dispatcher.id, e.target.checked); }}
          className="w-3.5 h-3.5 rounded-sm border-outline-variant/40 text-brand focus:ring-brand/30 cursor-pointer accent-brand"
        />
      </div>

      {/* Dispatcher */}
      <div className="flex items-center gap-2 min-w-0">
        <DispatcherAvatar
          dispatcherId={dispatcher.id}
          name={dispatcher.name}
          avatarUrl={avatarUrl}
          ringColor={ringColor}
          size="sm"
          onAvatarChange={(newUrl) => {
            setAvatarUrl(newUrl);
            onAvatarChange(dispatcher.id, newUrl);
          }}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenDrawer(dispatcher); }}
          className="min-w-0 text-left hover:opacity-70 transition-opacity"
          title="Open history"
        >
          <p className="text-[0.82rem] font-medium text-on-surface truncate uppercase">{dispatcher.name}</p>
          <p className="text-[0.66rem] text-on-surface-variant">{dispatcher.extId}</p>
        </button>
      </div>

      {/* Branch chips — one per assignment, most recent first */}
      <div
        className="flex items-center justify-center gap-1 flex-wrap"
        onClick={(e) => e.stopPropagation()}
        title={
          dispatcher.assignments.length > 1
            ? `${dispatcher.assignments.length} branches: ${dispatcher.assignments.map((a) => a.branchCode).join(", ")}`
            : undefined
        }
      >
        {dispatcher.assignments.length === 0 ? (
          <span className="text-[0.72rem] text-on-surface-variant/60">—</span>
        ) : (
          dispatcher.assignments.map((a, idx) => (
            <BranchChip
              key={`${a.branchCode}-${a.extId}`}
              code={a.branchCode}
              variant={idx === 0 ? "solid" : "muted"}
              title={idx === 0 ? `Current: ${a.branchCode}` : `Previous: ${a.branchCode}`}
            />
          ))
        )}
      </div>

      {/* IC No */}
      <div>
        <input
          type="text"
          value={icNo ? icNo.replace(/(\d{4})(?=\d)/g, "$1-") : ""}
          onChange={(e) => handleIcChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
          onClick={(e) => e.stopPropagation()}
          placeholder="—"
          maxLength={14}
          className={`${INPUT_CLASS} tabular-nums ${icError ? "border-critical/50!" : ""}`}
        />
        {icError && (
          <p className="text-[0.62rem] text-critical mt-0.5 text-center">{icError}</p>
        )}
      </div>

      {/* Weight Tier Chips */}
      <div className="group/tiers">
        <button
          ref={weightTierAnchorRef}
          onClick={(e) => { e.stopPropagation(); setEditingTier(editingTier === null ? 0 : null); }}
          className="flex items-center gap-1 w-full justify-center cursor-pointer"
        >
          {weightTiers.map((tier) => (
            <span
              key={tier.tier}
              className="px-1.5 py-0.5 text-[0.7rem] tabular-nums font-medium bg-surface-low text-on-surface-variant rounded-lg group-hover/tiers:bg-surface-hover transition-colors"
            >
              RM{tier.commission.toFixed(2)}
            </span>
          ))}
          <Pencil size={11} className="text-on-surface-variant/0 group-hover/tiers:text-on-surface-variant/50 transition-colors ml-0.5 shrink-0" />
        </button>

        <TierPopover
          open={editingTier !== null}
          anchorRef={weightTierAnchorRef}
          onClose={() => setEditingTier(null)}
          width={320}
        >
          <p className="text-[0.68rem] font-semibold text-on-surface-variant uppercase tracking-[0.05em] mb-2.5">
            Weight Tiers
          </p>
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
                {/* Min/Max use the focused/raw buffer in DecimalInput (non-cents)
                    so partial entries like "5." don't get round-tripped through
                    parseFloat back into "5", which is what was wiping the dot
                    before the user could type the decimal places. */}
                {i === 0 ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tier.minWeight}
                    disabled
                    readOnly
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-surface-low border border-outline-variant/30 rounded-lg text-on-surface text-center opacity-40"
                  />
                ) : (
                  <DecimalInput
                    value={tier.minWeight}
                    onChange={(n) => handleTierFieldChange(i, "minWeight", String(n))}
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center hover:bg-brand/5 hover:border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                )}
                {i === 2 ? (
                  <div className="w-full px-2 py-1 text-[0.78rem] text-on-surface-variant/50 text-center border border-transparent">∞</div>
                ) : (
                  <DecimalInput
                    value={tier.maxWeight ?? 0}
                    onChange={(n) => handleTierFieldChange(i, "maxWeight", String(n))}
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center hover:bg-brand/5 hover:border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                )}
                <DecimalInput
                  cents
                  value={tier.commission}
                  onChange={(n) => handleTierFieldChange(i, "commission", String(n))}
                  className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center hover:bg-brand/5 hover:border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40"
                />
              </div>
            ))}
          </div>
        </TierPopover>
      </div>

      {/* ── Separator ── */}
      <div className="h-6 rounded-full" style={{ backgroundColor: "rgba(18, 185, 129, 0.15)" }} />

      {/* ── Bonus Tier: Eligible, Min Orders, Tier Rates ── */}
      <Toggle color="#12B981" checked={incentiveEnabled} onChange={() => {
        const next = !incentiveEnabled;
        setBonusTierEnabled(next);
        if (!next) {
          setOrderThreshold(0);
        } else {
          const dt = defaults.incentiveRule;
          setOrderThreshold(dt.orderThreshold);
          if (bonusTiers.every((t) => t.commission === 0) && defaults.bonusTiers.length === 3) {
            setBonusTiers(defaults.bonusTiers);
          }
        }
      }} />

      {incentiveEnabled ? (
        <input
          type="text"
          inputMode="numeric"
          value={orderThreshold}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
            setOrderThreshold(v === "" ? 0 : parseInt(v, 10));
          }}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {/* Bonus Tier Chips — portaled for the same overflow-clip reason as weight tiers. */}
      {incentiveEnabled ? (
        <div className="group/itiers">
          <button
            ref={bonusTierAnchorRef}
            onClick={(e) => { e.stopPropagation(); setEditingBonusTier((v) => !v); }}
            className="flex items-center gap-1 w-full justify-center cursor-pointer"
            title="Edit bonus tier rates"
          >
            {bonusTiers.map((tier) => (
              <span
                key={tier.tier}
                className="px-1.5 py-0.5 text-[0.7rem] tabular-nums font-medium bg-emerald-50 text-emerald-900/80 rounded-lg group-hover/itiers:bg-emerald-100 transition-colors"
              >
                RM{tier.commission.toFixed(2)}
              </span>
            ))}
            <Pencil size={11} className="text-on-surface-variant/0 group-hover/itiers:text-on-surface-variant/50 transition-colors ml-0.5 shrink-0" />
          </button>

          <TierPopover
            open={editingBonusTier}
            anchorRef={bonusTierAnchorRef}
            onClose={() => setEditingBonusTier(false)}
            width={256}
          >
            <p className="text-[0.68rem] font-semibold text-emerald-700 uppercase tracking-[0.05em] mb-2.5">
              Bonus Tiers (post-threshold)
            </p>
            <p className="text-[0.64rem] text-on-surface-variant/70 mb-2">
              Applied to parcels after #{orderThreshold.toLocaleString()}. Weight ranges mirror the base tiers.
            </p>
            <div className="grid grid-cols-[2rem_1fr] gap-x-2 items-center mb-1">
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Tier</span>
              <span className="text-[0.6rem] text-on-surface-variant/60 text-center">Rate (RM)</span>
            </div>
            <div className="space-y-1.5">
              {bonusTiers.map((tier, i) => (
                <div key={tier.tier} className="grid grid-cols-[2rem_1fr] gap-x-2 items-center">
                  <span className="text-[0.7rem] font-semibold text-on-surface-variant text-center">T{tier.tier}</span>
                  <DecimalInput
                    cents
                    value={tier.commission}
                    onChange={(n) => handleBonusTierRateChange(i, String(n))}
                    className="w-full px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-lg text-on-surface text-center hover:bg-emerald-50 hover:border-outline-variant/50 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
                  />
                </div>
              ))}
            </div>
          </TierPopover>
        </div>
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {/* ── Separator ── */}
      <div className="h-6 rounded-full" style={{ backgroundColor: "rgba(251, 192, 36, 0.2)" }} />

      {/* ── Petrol: Eligible, Min Orders, Amount ── */}
      <Toggle color="#FBC024" checked={isEligible} onChange={() => setIsEligible((p) => !p)} />

      {isEligible ? (
        <input
          type="text"
          inputMode="numeric"
          value={dailyThreshold}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
            setDailyThreshold(v === "" ? 0 : parseInt(v, 10));
          }}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {isEligible ? (
        <DecimalInput
          value={subsidyAmount}
          onChange={setSubsidyAmount}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
          cents
        />
      ) : (
        <span className="block text-[0.78rem] text-on-surface-variant/30 text-center py-1">—</span>
      )}

      {/* Status */}
      <div className="flex justify-center">
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[0.72rem] font-medium text-on-surface-variant">
            <span className="w-3 h-3 border-[1.5px] border-on-surface-variant border-t-transparent rounded-full animate-spin" />
          </span>
        ) : isNew ? (
          <button
            onClick={(e) => { e.stopPropagation(); onAcknowledge(dispatcher.id); }}
            className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-brand hover:text-brand/80 transition-colors"
            title="Acknowledge new dispatcher"
          >
            <input
              type="checkbox"
              checked={false}
              readOnly
              className="w-3 h-3 rounded-sm accent-brand cursor-pointer"
            />
            New
          </button>
        ) : isDirty ? (
          <span className="inline-flex items-center gap-1 text-[0.72rem] font-medium text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unsaved
          </span>
        ) : dispatcher.firstSeen === "NEW" ? (
          <span className="inline-flex items-center gap-1 text-[0.72rem] font-medium text-brand">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            NEW
          </span>
        ) : (
          <span className="text-[0.72rem] font-medium text-on-surface-variant/70">
            {dispatcher.firstSeen}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 justify-center">
        <button
          onClick={(e) => onPin(e, dispatcher)}
          className={`p-1 rounded-lg transition-all ${
            dispatcher.isPinned
              ? "text-brand hover:bg-brand/10 [&_svg]:fill-current"
              : "text-on-surface-variant hover:text-brand hover:bg-brand/10"
          }`}
          title={dispatcher.isPinned ? "Unpin" : "Pin to top"}
        >
          <Pin size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDrawer(dispatcher); }}
          className="p-1 rounded-lg text-on-surface-variant hover:text-brand hover:bg-brand/10 transition-colors"
          title="Salary history"
        >
          <Clock size={12} />
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
