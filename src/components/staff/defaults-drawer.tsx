"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

const BTN = "flex-1 px-1.5 text-[0.6rem] text-on-surface-variant hover:text-brand transition-colors";

function DecimalInput({ value, onChange, className, disabled, cents, step = 0.01 }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  disabled?: boolean;
  cents?: boolean;
  step?: number;
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

  const nudge = (dir: 1 | -1) => {
    const inc = cents ? 0.01 : step;
    const next = Math.max(0, Math.round((value + dir * inc) * 100) / 100);
    onChange(next);
    setRaw(cents ? Math.round(next * 100).toString() : String(next));
  };

  return (
    <div className="relative group/dec">
      <input
        type="text" inputMode={cents ? "numeric" : "decimal"}
        value={display}
        disabled={disabled}
        onChange={(e) => {
          if (cents) {
            const digits = e.target.value.replace(/\D/g, "");
            setRaw(digits);
            onChange(parseInt(digits || "0", 10) / 100);
          } else {
            const v = e.target.value.replace(",", ".");
            if (v === "" || /^\d*\.?\d*$/.test(v)) {
              setRaw(v);
              onChange(v === "" ? 0 : parseFloat(v) || 0);
            }
          }
        }}
        onFocus={() => { setFocused(true); setRaw(cents ? Math.round(value * 100).toString() : String(value)); }}
        onBlur={() => setFocused(false)}
        className={className}
      />
      {!disabled && (
        <div className="absolute right-0 top-0 bottom-0 flex flex-col opacity-0 group-hover/dec:opacity-100 transition-opacity">
          <button type="button" onClick={() => nudge(1)} className={BTN}>▲</button>
          <button type="button" onClick={() => nudge(-1)} className={BTN}>▼</button>
        </div>
      )}
    </div>
  );
}

function IntegerInput({ value, onChange, className }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <div className="relative group/int">
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          onChange(v === "" ? 0 : parseInt(v, 10));
        }}
        className={className}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col opacity-0 group-hover/int:opacity-100 transition-opacity">
        <button type="button" onClick={() => onChange(Math.max(0, value + 1))} className={BTN}>▲</button>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className={BTN}>▼</button>
      </div>
    </div>
  );
}

interface DefaultValues {
  weightTiers: { tier: number; minWeight: number; maxWeight: number | null; commission: number }[];
  incentiveRule: { orderThreshold: number; incentiveAmount: number };
  petrolRule: { isEligible: boolean; dailyThreshold: number; subsidyAmount: number };
}


interface DefaultsDrawerProps {
  checkedIds: Set<string>;
  initialValues: DefaultValues;
  onClose: () => void;
  onApplied: () => Promise<void>;
}

export function DefaultsDrawer({ checkedIds, initialValues, onClose, onApplied }: DefaultsDrawerProps) {
  const [values, setValues] = useState<DefaultValues>(initialValues);
  const [applying, setApplying] = useState(false);
  const [incentiveEnabled, setIncentiveEnabled] = useState(initialValues.incentiveRule.orderThreshold > 0);

  const INPUT =
    "w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface text-center focus:outline-none focus:ring-1 focus:ring-brand/40";

  function setTierField(index: number, field: "minWeight" | "maxWeight" | "commission", raw: string) {
    setValues((prev) => ({
      ...prev,
      weightTiers: prev.weightTiers.map((t, i) => {
        if (i !== index) return t;
        const num = parseFloat(raw.replace(",", "."));
        return { ...t, [field]: isNaN(num) ? 0 : num };
      }),
    }));
  }

  async function handleApply(mode: "all" | "selected") {
    setApplying(true);
    try {
      // Save defaults to DB first
      await fetch("/api/staff/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = mode === "selected"
        ? { ...values, dispatcherIds: Array.from(checkedIds) }
        : values;
      const res = await fetch("/api/staff/apply-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Defaults applied to ${data.count} dispatchers`, { duration: 5000 });
      // Wait for data refresh before closing
      await onApplied();
      onClose();
    } catch {
      toast.error("Failed to apply defaults");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-on-surface/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <div>
            <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">Default Settings</h2>
            <p className="text-[0.72rem] text-on-surface-variant mt-0.5">
              Set values here, then apply to all dispatchers at once.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-hover transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Weight Tiers */}
          <section>
            <h3 className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-3">
              Weight Tiers
            </h3>
            <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-x-2 items-center mb-1.5">
              <span className="text-[0.62rem] text-on-surface-variant/60 text-center">Tier</span>
              <span className="text-[0.62rem] text-on-surface-variant/60 text-center">Min (kg)</span>
              <span className="text-[0.62rem] text-on-surface-variant/60 text-center">Max (kg)</span>
              <span className="text-[0.62rem] text-on-surface-variant/60 text-center">Rate (RM)</span>
            </div>
            <div className="space-y-2">
              {values.weightTiers.map((tier, i) => (
                <div key={tier.tier} className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-x-2 items-center">
                  <span className="text-[0.78rem] font-semibold text-on-surface-variant text-center">T{tier.tier}</span>
                  <DecimalInput
                    value={tier.minWeight}
                    disabled={i === 0}
                    onChange={(n) => setTierField(i, "minWeight", String(n))}
                    className={`${INPUT} ${i === 0 ? "opacity-40 bg-surface-low" : ""}`}
                  />
                  {i === 2 ? (
                    <div className="text-[1.5rem] text-on-surface-variant/50 text-center py-1.5">∞</div>
                  ) : (
                    <DecimalInput
                      value={tier.maxWeight ?? 0}
                      onChange={(n) => setTierField(i, "maxWeight", String(n))}
                      className={INPUT}
                    />
                  )}
                  <DecimalInput
                    value={tier.commission}
                    onChange={(n) => setTierField(i, "commission", String(n))}
                    className={INPUT}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Incentive */}
          <section>
            <h3 className="text-[0.72rem] font-medium tracking-[0.05em] uppercase mb-3" style={{ color: "#12B981" }}>
              Incentive
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-[0.78rem] text-on-surface-variant">Eligible by default</label>
              <button
                type="button"
                role="switch"
                aria-checked={incentiveEnabled}
                onClick={() => {
                  const next = !incentiveEnabled;
                  setIncentiveEnabled(next);
                  if (!next) {
                    setValues((v) => ({ ...v, incentiveRule: { ...v.incentiveRule, orderThreshold: 0 } }));
                  } else {
                    setValues((v) => ({
                      ...v,
                      incentiveRule: {
                        orderThreshold: v.incentiveRule.orderThreshold || 2000,
                        incentiveAmount: v.incentiveRule.incentiveAmount || 200,
                      },
                    }));
                  }
                }}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ backgroundColor: incentiveEnabled ? "#12B981" : "rgba(195, 198, 214, 0.4)" }}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${incentiveEnabled ? "translate-x-4" : ""}`} />
              </button>
            </div>
            {incentiveEnabled ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.68rem] text-on-surface-variant mb-1">Min Orders / Month</label>
                  <IntegerInput
                    value={values.incentiveRule.orderThreshold}
                    onChange={(n) => setValues((v) => ({ ...v, incentiveRule: { ...v.incentiveRule, orderThreshold: n } }))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-[0.68rem] text-on-surface-variant mb-1">Amount (RM)</label>
                  <DecimalInput
                    value={values.incentiveRule.incentiveAmount}
                    onChange={(n) => setValues((v) => ({ ...v, incentiveRule: { ...v.incentiveRule, incentiveAmount: n } }))}
                    className={INPUT}
                    cents
                  />
                </div>
              </div>
            ) : (
              <p className="text-[0.75rem] text-on-surface-variant/50">Incentive will be off for all dispatchers.</p>
            )}
          </section>

          {/* Petrol */}
          <section>
            <h3 className="text-[0.72rem] font-medium tracking-[0.05em] uppercase mb-3" style={{ color: "#D4A017" }}>
              Petrol Subsidy
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-[0.78rem] text-on-surface-variant">Eligible by default</label>
              <button
                type="button"
                role="switch"
                aria-checked={values.petrolRule.isEligible}
                onClick={() => setValues((v) => ({ ...v, petrolRule: { ...v.petrolRule, isEligible: !v.petrolRule.isEligible } }))}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ backgroundColor: values.petrolRule.isEligible ? "#FBC024" : "rgba(195, 198, 214, 0.4)" }}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${values.petrolRule.isEligible ? "translate-x-4" : ""}`} />
              </button>
            </div>
            {values.petrolRule.isEligible ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.68rem] text-on-surface-variant mb-1">Min Orders / Day</label>
                  <IntegerInput
                    value={values.petrolRule.dailyThreshold}
                    onChange={(n) => setValues((v) => ({ ...v, petrolRule: { ...v.petrolRule, dailyThreshold: n } }))}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-[0.68rem] text-on-surface-variant mb-1">Subsidy (RM / Day)</label>
                  <DecimalInput
                    value={values.petrolRule.subsidyAmount}
                    onChange={(n) => setValues((v) => ({ ...v, petrolRule: { ...v.petrolRule, subsidyAmount: n } }))}
                    className={INPUT}
                    cents
                  />
                </div>
              </div>
            ) : (
              <p className="text-[0.75rem] text-on-surface-variant/50">Petrol subsidy will be off for all dispatchers.</p>
            )}
          </section>

          {/* Info note */}
          <div className="bg-brand/5 rounded-[0.375rem] px-3.5 py-2.5">
            <p className="text-[0.75rem] text-on-surface-variant leading-relaxed">
              Use <strong>Apply to All</strong> to overwrite every dispatcher, or check specific rows and use <strong>Apply to Selected</strong>.
              {checkedIds.size > 0 && <> Currently <strong>{checkedIds.size}</strong> selected.</>}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/15 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApply("all")}
              disabled={applying}
              className="px-4 py-2 text-[0.84rem] font-medium text-brand bg-brand/10 rounded-[0.375rem] hover:bg-brand/15 transition-colors disabled:opacity-60"
            >
              Apply to All
            </button>
            {checkedIds.size > 0 && (
              <button
                onClick={() => handleApply("selected")}
                disabled={applying}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                Apply to {checkedIds.size} Selected
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
