"use client";

interface IncentiveRule {
  orderThreshold: number;
  incentiveAmount: number;
}

interface IncentiveSectionProps {
  rule: IncentiveRule | null;
  onUpdate: (rule: IncentiveRule) => void;
}

export function IncentiveSection({ rule, onUpdate }: IncentiveSectionProps) {
  const current = rule ?? { orderThreshold: 2000, incentiveAmount: 0 };

  function handleChange(field: keyof IncentiveRule, value: string) {
    const num = parseFloat(value);
    onUpdate({ ...current, [field]: isNaN(num) ? 0 : num });
  }

  return (
    <section>
      <h3 className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-3">
        Monthly Incentive
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-[0.68rem] text-on-surface-variant mb-1">Order Threshold</label>
          <input
            type="number"
            value={current.orderThreshold}
            onChange={(e) => handleChange("orderThreshold", e.target.value)}
            onBlur={() => onUpdate(current)}
            className="w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </div>
        <div>
          <label className="block text-[0.68rem] text-on-surface-variant mb-1">Incentive Amount (RM)</label>
          <input
            type="number"
            step="0.01"
            value={current.incentiveAmount || ""}
            placeholder="Required"
            onChange={(e) => handleChange("incentiveAmount", e.target.value)}
            onBlur={() => onUpdate(current)}
            className="w-full px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </div>
      </div>
    </section>
  );
}
