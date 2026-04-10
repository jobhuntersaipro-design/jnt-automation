"use client";

interface WeightTier {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface WeightTierSectionProps {
  tiers: WeightTier[];
  onUpdate: (tiers: WeightTier[]) => void;
}

const DEFAULTS: WeightTier[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

export function WeightTierSection({ tiers, onUpdate }: WeightTierSectionProps) {
  const rows = tiers.length === 3 ? tiers : DEFAULTS;

  function handleChange(tierIndex: number, field: "minWeight" | "maxWeight" | "commission", value: string) {
    const updated = rows.map((t, i) => {
      if (i !== tierIndex) return t;
      const num = parseFloat(value);
      return { ...t, [field]: isNaN(num) ? 0 : num };
    });
    onUpdate(updated);
  }

  return (
    <section>
      <h3 className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-3">
        Weight Tiers
      </h3>
      <div className="space-y-2">
        {/* Column labels */}
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-1">
          {["Min (kg)", "Max (kg)", "Commission (RM)"].map((label) => (
            <span key={label} className="text-[0.68rem] text-on-surface-variant">
              {label}
            </span>
          ))}
        </div>

        {rows.map((tier, i) => (
          <div key={tier.tier} className="grid grid-cols-[1fr_1fr_1fr] gap-2">
            {/* Min weight — Tier 1 locked at 0 */}
            <input
              type="number"
              step="0.01"
              value={tier.minWeight}
              disabled={i === 0}
              onChange={(e) => handleChange(i, "minWeight", e.target.value)}
              onBlur={() => onUpdate(rows)}
              className="px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40 disabled:bg-surface-low disabled:text-on-surface-variant/60"
            />

            {/* Max weight — Tier 3 shows ∞ */}
            {i === 2 ? (
              <div className="px-2.5 py-1.5 text-[0.84rem] bg-surface-low border border-outline-variant/30 rounded-[0.375rem] text-on-surface-variant/60 flex items-center">
                ∞
              </div>
            ) : (
              <input
                type="number"
                step="0.01"
                value={tier.maxWeight ?? ""}
                onChange={(e) => handleChange(i, "maxWeight", e.target.value)}
                onBlur={() => onUpdate(rows)}
                className="px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40"
              />
            )}

            {/* Commission */}
            <input
              type="number"
              step="0.01"
              value={tier.commission}
              onChange={(e) => handleChange(i, "commission", e.target.value)}
              onBlur={() => onUpdate(rows)}
              className="px-2.5 py-1.5 text-[0.84rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
