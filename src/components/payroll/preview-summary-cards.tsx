"use client";

interface PreviewSummaryCardsProps {
  totalNetPayout: number;
  totalBaseSalary: number;
  totalIncentive: number;
  totalPetrolSubsidy: number;
  totalDeductions: number;
}

function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SummaryCard({
  label,
  value,
  isHero,
}: {
  label: string;
  value: string;
  isHero?: boolean;
}) {
  if (isHero) {
    return (
      <div className="rounded-xl p-4 text-white flex flex-col justify-center"
        style={{ background: "linear-gradient(135deg, #0056D2, #0056d2)" }}
      >
        <p className="text-[0.72rem] uppercase tracking-wider text-white/70 font-medium">
          {label}
        </p>
        <p className="text-[1.25rem] font-bold tracking-tight mt-1 tabular-nums">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-card p-4 border-l-4 border-tertiary flex flex-col justify-center">
      <p className="text-[0.72rem] uppercase tracking-wider text-on-surface-variant font-medium">
        {label}
      </p>
      <p className="text-[0.95rem] font-semibold text-on-surface mt-0.5 tabular-nums whitespace-nowrap">
        {value}
      </p>
    </div>
  );
}

export function PreviewSummaryCards({
  totalNetPayout,
  totalBaseSalary,
  totalIncentive,
  totalPetrolSubsidy,
  totalDeductions,
}: PreviewSummaryCardsProps) {
  return (
    <div className="grid grid-cols-5 gap-3">
      <SummaryCard label="Total Net Payout" value={formatRM(totalNetPayout)} isHero />
      <SummaryCard label="Base Salary" value={formatRM(totalBaseSalary)} />
      <SummaryCard label="Incentive" value={formatRM(totalIncentive)} />
      <SummaryCard label="Petrol Subsidy" value={formatRM(totalPetrolSubsidy)} />
      <SummaryCard label="Deductions" value={formatRM(totalDeductions)} />
    </div>
  );
}
