import { lookupSocso } from "./socso-table"
import { lookupEis } from "./eis-table"

export interface StatutoryResult {
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
}

/**
 * EPF uses RM20 salary bracket ceiling for calculation.
 * e.g. salary 4,050 → bracket ceiling 4,060 → 4,060 × rate
 */
function epfBracketCeiling(salary: number): number {
  return Math.ceil(salary / 20) * 20
}

/**
 * Calculate all statutory contributions (EPF, SOCSO, EIS) for a given gross salary.
 *
 * EPF: 11% employee, 13% employer (≤RM5,000) or 12% employer (>RM5,000).
 *      Calculated on RM20 bracket ceiling. Rounded to nearest RM.
 * SOCSO: First Category bracket lookup, capped at RM6,000.
 * EIS: Bracket lookup, capped at RM6,000.
 */
export function calculateStatutory(grossSalary: number): StatutoryResult {
  if (grossSalary <= 0) {
    return {
      epfEmployee: 0,
      epfEmployer: 0,
      socsoEmployee: 0,
      socsoEmployer: 0,
      eisEmployee: 0,
      eisEmployer: 0,
    }
  }

  // EPF — RM20 bracket ceiling, round to nearest RM
  const epfBase = epfBracketCeiling(grossSalary)
  const epfEmployee = Math.round(epfBase * 0.11)
  const epfEmployerRate = grossSalary <= 5000 ? 0.13 : 0.12
  const epfEmployer = Math.round(epfBase * epfEmployerRate)

  // SOCSO — First Category bracket lookup, capped at RM6,000
  const socso = lookupSocso(grossSalary)

  // EIS — bracket lookup, capped at RM6,000
  const eis = lookupEis(grossSalary)

  return {
    epfEmployee,
    epfEmployer,
    socsoEmployee: socso.employee,
    socsoEmployer: socso.employer,
    eisEmployee: eis.employee,
    eisEmployer: eis.employer,
  }
}

/**
 * Calculate net salary from gross, statutory deductions, PCB, penalty, and advance.
 */
export function calculateNetSalary(
  grossSalary: number,
  statutory: StatutoryResult,
  pcb: number,
  penalty: number,
  advance: number
): number {
  return (
    grossSalary -
    statutory.epfEmployee -
    statutory.socsoEmployee -
    statutory.eisEmployee -
    pcb -
    penalty -
    advance
  )
}

/**
 * Calculate gross salary for a supervisor/admin employee.
 *
 * `workingHours` and `hourlyWage` are optional — when both are set, the
 * product is added on top of the monthly basic pay. This lets supervisors
 * and admins log extra hourly work (e.g. weekend OT) alongside their fixed
 * salary. Leaving them unset preserves the original basic-pay-only formula.
 */
export function calculateSupervisorGross(
  basicPay: number,
  petrolAllowance: number,
  kpiAllowance: number,
  otherAllowance: number,
  workingHours: number = 0,
  hourlyWage: number = 0,
): number {
  return (
    basicPay +
    workingHours * hourlyWage +
    petrolAllowance +
    kpiAllowance +
    otherAllowance
  )
}

/**
 * Calculate gross salary for a store keeper employee.
 */
export function calculateStoreKeeperGross(
  workingHours: number,
  hourlyWage: number,
  petrolAllowance: number,
  kpiAllowance: number,
  otherAllowance: number
): number {
  return workingHours * hourlyWage + petrolAllowance + kpiAllowance + otherAllowance
}
