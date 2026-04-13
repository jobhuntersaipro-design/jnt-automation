interface SalaryRow {
  extId: string;
  name: string;
  branchCode: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

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
 * Generate CSV string from salary records.
 */
export function generatePayrollCSV(records: SalaryRow[]): string {
  const headers = [
    "Dispatcher ID",
    "Dispatcher Name",
    "Branch",
    "Total Orders",
    "Base Salary",
    "Incentive",
    "Petrol Subsidy",
    "Penalty",
    "Advance",
    "Net Salary",
  ];

  const rows = records.map((r) =>
    [
      escapeCSV(r.extId),
      escapeCSV(r.name),
      escapeCSV(r.branchCode),
      String(r.totalOrders),
      formatAmount(r.baseSalary),
      formatAmount(r.incentive),
      formatAmount(r.petrolSubsidy),
      formatAmount(r.penalty),
      formatAmount(r.advance),
      formatAmount(r.netSalary),
    ].join(","),
  );

  // Total row
  const totals = records.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.totalOrders,
      baseSalary: acc.baseSalary + r.baseSalary,
      incentive: acc.incentive + r.incentive,
      petrolSubsidy: acc.petrolSubsidy + r.petrolSubsidy,
      penalty: acc.penalty + r.penalty,
      advance: acc.advance + r.advance,
      netSalary: acc.netSalary + r.netSalary,
    }),
    { totalOrders: 0, baseSalary: 0, incentive: 0, petrolSubsidy: 0, penalty: 0, advance: 0, netSalary: 0 },
  );

  const totalRow = [
    "TOTAL",
    "",
    "",
    String(totals.totalOrders),
    formatAmount(totals.baseSalary),
    formatAmount(totals.incentive),
    formatAmount(totals.petrolSubsidy),
    formatAmount(totals.penalty),
    formatAmount(totals.advance),
    formatAmount(totals.netSalary),
  ].join(",");

  return [headers.join(","), ...rows, totalRow].join("\n");
}
