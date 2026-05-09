import { lookupSocso } from "./socso-table"
import { lookupEis } from "./eis-table"

export interface StatutoryResult {
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
  /**
   * KWSP Jadual Ketiga (Third Schedule, 1 Oct 2025) Part A p.12 bonus rule
   * applied: when an employee whose base wage is ≤ RM5,000 receives a bonus
   * that pushes the month's wage > RM5,000, the employer's contribution
   * stays at 13% instead of dropping to 12%. We use kpiAllowance as the
   * bonus proxy — true = rule kicked in, employer rate held at 13%.
   */
  epfBonusRuleApplied: boolean
}

/**
 * KWSP bracket ceiling per the Third Schedule:
 *   wages 0.01 – 10.00     → NIL (zero contribution)
 *   wages 10.01 – 5,000    → ceil to next RM 20
 *   wages 5,000.01 – 20,000 → ceil to next RM 100
 *   wages > 20,000          → no bracket (apply rate to raw wage, ceil)
 *
 * Returns 0 for wages ≤ 10 to signal "use NIL", and the literal salary for
 * wages > 20,000 so the caller can apply the rate directly.
 */
function epfBase(salary: number): number {
  if (salary <= 10) return 0
  if (salary <= 5000) return Math.ceil(salary / 20) * 20
  if (salary <= 20000) return Math.ceil(salary / 100) * 100
  return salary
}

/**
 * Calculate all statutory contributions (EPF, SOCSO, EIS) for a given gross salary.
 *
 * EPF — KWSP Jadual Ketiga, 1 Oct 2025, Part A (Malaysian citizens < 60):
 *   Employee 11% on bracket base, ceil to next RM.
 *   Employer 13% if wages ≤ RM5,000, otherwise 12%.
 *   Bonus rule (p.12): if base wage (gross − KPI allowance) is ≤ RM5,000 but
 *     KPI pushes the month above, employer stays at 13%. Pass kpiAllowance to
 *     activate. Default 0 = rule never fires.
 * SOCSO: First Category bracket lookup, capped at RM6,000.
 * EIS: Bracket lookup, capped at RM6,000.
 */
export function calculateStatutory(
  grossSalary: number,
  kpiAllowance: number = 0,
): StatutoryResult {
  if (grossSalary <= 0) {
    return {
      epfEmployee: 0,
      epfEmployer: 0,
      socsoEmployee: 0,
      socsoEmployer: 0,
      eisEmployee: 0,
      eisEmployer: 0,
      epfBonusRuleApplied: false,
    }
  }

  // P.12 bonus rule: base wage (gross excluding the KPI/bonus proxy) is ≤ 5k
  // but bonus pushed gross over 5k → employer stays at 13%.
  const baseWageWithoutBonus = Math.max(0, grossSalary - kpiAllowance)
  const epfBonusRuleApplied =
    grossSalary > 5000 && baseWageWithoutBonus <= 5000

  const useEmployer13 = grossSalary <= 5000 || epfBonusRuleApplied
  const employerRate = useEmployer13 ? 0.13 : 0.12

  let epfEmployee = 0
  let epfEmployer = 0
  if (grossSalary > 20000) {
    // Above the table — schedule applies rates directly to the wage,
    // total rounded up to next ringgit. Rounding each part with ceil keeps
    // the parts internally consistent and never under-pays.
    epfEmployee = Math.ceil(grossSalary * 0.11)
    epfEmployer = Math.ceil(grossSalary * employerRate)
  } else {
    const base = epfBase(grossSalary)
    epfEmployee = Math.ceil(base * 0.11)
    epfEmployer = Math.ceil(base * employerRate)
  }

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
    epfBonusRuleApplied,
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
