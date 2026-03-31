import { mockSalaryBreakdown } from "@/lib/mock-data";

const COLORS = {
  baseSalary: "#0056d2",
  incentive: "#87D4C4",
  petrolSubsidy: "#FFD747",
  deductions: "#F68D8D",
};

const LEGEND = [
  { key: "baseSalary" as const, label: "Base Salary", color: COLORS.baseSalary },
  { key: "incentive" as const, label: "Incentive", color: COLORS.incentive },
  { key: "petrolSubsidy" as const, label: "Petrol Subsidy", color: COLORS.petrolSubsidy },
  { key: "deductions" as const, label: "Deductions", color: COLORS.deductions },
];

function fmtShort(n: number) {
  if (n >= 1_000_000) return `RM ${(n / 1_000_000).toFixed(1)}M`;
  return `RM ${(n / 1_000).toFixed(0)}K`;
}

export function SalaryBreakdown() {
  const max = Math.max(
    ...mockSalaryBreakdown.map(
      (d) => d.baseSalary + d.incentive + d.petrolSubsidy + d.deductions
    )
  );

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading font-semibold text-[1rem] text-on-surface">
            Salary Breakdown
          </h2>
          <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
            Base salary vs components per month
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-end">
          {LEGEND.map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-[0.7rem] text-on-surface-variant">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="flex items-end gap-3 h-36">
        {mockSalaryBreakdown.map((d) => {
          const total = d.baseSalary + d.incentive + d.petrolSubsidy + d.deductions;
          const totalPct = (total / max) * 100;
          const segments = [
            { key: "baseSalary", value: d.baseSalary, color: COLORS.baseSalary, label: "Base" },
            { key: "incentive", value: d.incentive, color: COLORS.incentive, label: "Incentive" },
            { key: "petrolSubsidy", value: d.petrolSubsidy, color: COLORS.petrolSubsidy, label: "Petrol" },
            { key: "deductions", value: d.deductions, color: COLORS.deductions, label: "Deductions" },
          ];

          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-2 relative group">
              {/* Hover tooltip */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 bg-on-surface text-white text-[0.65rem] px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 space-y-0.5">
                <div className="font-semibold mb-0.5">{d.month}</div>
                {segments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                    <span className="text-white/80">{seg.label}:</span>
                    <span>{fmtShort(seg.value)}</span>
                  </div>
                ))}
              </div>
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                <div
                  className="w-full rounded-t-lg overflow-hidden flex flex-col-reverse"
                  style={{ height: `${totalPct}%` }}
                >
                  {segments.map((seg) => (
                    <div
                      key={seg.key}
                      style={{
                        background: seg.color,
                        height: `${(seg.value / total) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <span className="text-[0.7rem] text-on-surface-variant">{d.month}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[0.7rem] text-on-surface-variant/60 text-center">
        Chart component — Phase 2
      </p>
    </div>
  );
}
