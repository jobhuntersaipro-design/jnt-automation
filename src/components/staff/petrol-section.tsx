"use client";

interface PetrolRule {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
}

interface PetrolSectionProps {
  rule: PetrolRule | null;
  onUpdate: (rule: PetrolRule) => void;
}

export function PetrolSection({ rule, onUpdate }: PetrolSectionProps) {
  const current = rule ?? { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 };

  function handleToggle() {
    onUpdate({ ...current, isEligible: !current.isEligible });
  }

  function handleChange(field: "dailyThreshold" | "subsidyAmount", value: string) {
    const num = parseFloat(value);
    onUpdate({ ...current, [field]: isNaN(num) ? 0 : num });
  }

  return (
    <section>
      <h3 className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-3">
        Petrol Subsidy
      </h3>
      <div className="space-y-3">
        {/* Eligibility toggle */}
        <div className="flex items-center justify-between">
          <label className="text-[0.84rem] text-on-surface">Eligible</label>
          <button
            type="button"
            role="switch"
            aria-checked={current.isEligible}
            onClick={handleToggle}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              current.isEligible ? "bg-brand" : "bg-outline-variant/40"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                current.isEligible ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>

        {/* Conditional fields */}
        {current.isEligible && (
          <>
            <div>
              <label className="block text-[0.68rem] text-on-surface-variant mb-1">Daily Threshold (orders)</label>
              <input
                type="number"
                value={current.dailyThreshold}
                onChange={(e) => handleChange("dailyThreshold", e.target.value)}
                onBlur={() => onUpdate(current)}
                className="w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </div>
            <div>
              <label className="block text-[0.68rem] text-on-surface-variant mb-1">Subsidy Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                value={current.subsidyAmount}
                onChange={(e) => handleChange("subsidyAmount", e.target.value)}
                onBlur={() => onUpdate(current)}
                className="w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
