/**
 * Pure helpers for the dispatcher-vs-staff salary breakdown shown across
 * the Overview hero card, the new stacked-bar chart, and the branch detail
 * Net payout card.
 *
 * Combined-record overlap (an employee who is also a dispatcher) is
 * intentionally left in — `EmployeeSalaryRecord.netSalary` absorbs the
 * linked dispatcher's gross. See the spec's "Data model" section.
 */

export interface NetSalaryRow {
  netSalary: number;
}

export interface NetPayoutSplit {
  dispatcher: number;
  staff: number;
  total: number;
}

export function splitNetPayout(
  dispatcherRecords: NetSalaryRow[],
  staffRecords: NetSalaryRow[],
): NetPayoutSplit {
  const dispatcher = dispatcherRecords.reduce((s, r) => s + r.netSalary, 0);
  const staff = staffRecords.reduce((s, r) => s + r.netSalary, 0);
  return { dispatcher, staff, total: dispatcher + staff };
}

export interface AvgMonthlyInput {
  dispatcherTotal: number;
  dispatcherUnique: number;
  staffTotal: number;
  staffUnique: number;
}

export interface AvgMonthlySalary {
  dispatcher: number;
  staff: number;
}

export function computeAvgMonthlySalary(input: AvgMonthlyInput): AvgMonthlySalary {
  return {
    dispatcher:
      input.dispatcherUnique > 0 ? input.dispatcherTotal / input.dispatcherUnique : 0,
    staff: input.staffUnique > 0 ? input.staffTotal / input.staffUnique : 0,
  };
}
