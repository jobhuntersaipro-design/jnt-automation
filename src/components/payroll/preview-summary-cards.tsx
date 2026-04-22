"use client";

interface PreviewSummaryCardsProps {
  totalNetPayout: number;
  totalBaseSalary: number;
  totalIncentive: number;
  totalPetrolSubsidy: number;
  totalDeductions: number;
  /**
   * - "preview" (default) — uniform critical-red accent on all non-hero cards
   *   (used by the upload preview flow for continuity with existing design)
   * - "semantic" — color-code each card by meaning (earnings vs deductions)
   *   (used by the saved salary table to aid scanning)
   */
  variant?: "preview" | "semantic";
  /** Optional subtitle shown under the hero card value (e.g. dispatcher count + month) */
  heroSubtitle?: string;
}

function formatRM(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SummaryCard({
  label,
  value,
  accent,
  subtitle,
}: {
  label: string;
  value: string;
  accent?: "hero" | "neutral" | "incentive" | "petrol" | "critical";
  subtitle?: string;
}) {
  if (accent === "hero") {
    return (
      <div
        className="rounded-xl p-4 text-white flex flex-col justify-center"
        style={{ background: "linear-gradient(135deg, #0056D2, #0056d2)" }}
      >
        <p className="text-[0.72rem] uppercase tracking-wider text-white/70 font-medium">
          {label}
        </p>
        <p className="text-[1.15rem] font-bold tracking-tight mt-1 tabular-nums whitespace-nowrap">
          {value}
        </p>
        {subtitle && (
          <p className="text-[0.7rem] text-white/70 mt-1 truncate">{subtitle}</p>
        )}
      </div>
    );
  }

  const borderColor =
    accent === "incentive"
      ? "#12B981"
      : accent === "petrol"
      ? "#FBC024"
      : accent === "critical"
      ? "#940002"
      : accent === "neutral"
      ? "#424654"
      : "#940002";

  return (
    <div
      className="rounded-xl bg-surface-card p-4 border-l-4 flex flex-col justify-center"
      style={{ borderLeftColor: borderColor }}
    >
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
  variant = "preview",
  heroSubtitle,
}: PreviewSummaryCardsProps) {
  const isSemantic = variant === "semantic";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <SummaryCard
        label="Total Net Payout"
        value={formatRM(totalNetPayout)}
        accent="hero"
        subtitle={heroSubtitle}
      />
      <SummaryCard
        label="Base Salary"
        value={formatRM(totalBaseSalary)}
        accent={isSemantic ? "neutral" : undefined}
      />
      <SummaryCard
        label="Incentive"
        value={formatRM(totalIncentive)}
        accent={isSemantic ? "incentive" : undefined}
      />
      <SummaryCard
        label="Petrol Subsidy"
        value={formatRM(totalPetrolSubsidy)}
        accent={isSemantic ? "petrol" : undefined}
      />
      <SummaryCard
        label="Deductions"
        value={formatRM(totalDeductions)}
        accent="critical"
      />
    </div>
  );
}
