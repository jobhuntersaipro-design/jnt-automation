import type { DispatcherExportRow, BranchExportRow } from "@/lib/db/overview-export";

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV for dispatcher performance data with settings snapshots.
 */
export function generateDispatcherCSV(rows: DispatcherExportRow[]): string {
  const headers = [
    "Name", "Month", "Branch", "Total Orders",
    "Base Salary (RM)", "Bonus Tier (RM)", "Petrol Subsidy (RM)", "Penalty (RM)", "Advance (RM)", "Net Salary (RM)",
    "T1 Range (kg)", "T1 Rate (RM)", "T2 Range (kg)", "T2 Rate (RM)", "T3 Range (kg)", "T3 Rate (RM)",
    "Bonus Tier Threshold (orders)", "Bonus Tier Commission (RM)",
    "Petrol Eligible", "Petrol Threshold (orders/day)", "Petrol Amount (RM/day)",
  ];

  const dataRows = rows.map((r) =>
    [
      escapeCSV(r.name),
      escapeCSV(r.month),
      escapeCSV(r.branch),
      String(r.totalOrders),
      formatAmount(r.baseSalary),
      formatAmount(r.bonusTierEarnings),
      formatAmount(r.petrolSubsidy),
      formatAmount(r.penalty),
      formatAmount(r.advance),
      formatAmount(r.netSalary),
      escapeCSV(r.t1Range),
      formatAmount(r.t1Rate),
      escapeCSV(r.t2Range),
      formatAmount(r.t2Rate),
      escapeCSV(r.t3Range),
      formatAmount(r.t3Rate),
      String(r.incentiveThreshold),
      formatAmount(r.incentiveAmount),
      r.petrolEligible ? "Yes" : "No",
      String(r.petrolThreshold),
      formatAmount(r.petrolAmount),
    ].join(","),
  );

  return [headers.join(","), ...dataRows].join("\n");
}

/**
 * Generate CSV for branch-level aggregated data.
 */
export function generateBranchCSV(rows: BranchExportRow[]): string {
  const headers = [
    "Branch", "Month", "Dispatcher Count", "Total Orders", "Total Net Payout (RM)",
  ];

  const dataRows = rows.map((r) =>
    [
      escapeCSV(r.branch),
      escapeCSV(r.month),
      String(r.dispatcherCount),
      String(r.totalOrders),
      formatAmount(r.totalNetPayout),
    ].join(","),
  );

  return [headers.join(","), ...dataRows].join("\n");
}
