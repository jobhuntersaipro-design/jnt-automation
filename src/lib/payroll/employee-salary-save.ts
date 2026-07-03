import {
  calculateStatutory,
  calculateNetSalary,
  calculateSupervisorGross,
  calculateStoreKeeperGross,
} from "./statutory";
import { usesUnitsRate, type EmployeeTypeName } from "@/lib/staff/employee-subtype";
import type {
  EmployeeType,
  StoreKeeperSubtype,
  PayMode,
} from "@/generated/prisma/client";

export interface EmployeeSavePayload {
  employeeId: string;
  basicPay: number;
  workingHours: number;
  hourlyWage: number;
  /** HOUR | DAY — purely a payslip-label distinction; math is identical. */
  payMode?: PayMode | null;
  kpiAllowance: number;
  petrolAllowance: number;
  /** Per-month OT (overtime) amount. Treated as a regular allowance for
   *  gross + statutory math (NOT as a bonus proxy — only KPI is). */
  otAllowance: number;
  otherAllowance: number;
  pcb: number;
  penalty: number;
  advance: number;
  // Optional statutory overrides — when present, persist verbatim (including 0).
  // When omitted, fall back to auto-calc from totalGross.
  epfEmployee?: number;
  socsoEmployee?: number;
  /** Employee SOCSO Non-Employment Injury share ("Lindung 24 Jam"). */
  socsoLindung?: number;
  eisEmployee?: number;
  epfEmployer?: number;
  socsoEmployer?: number;
  eisEmployer?: number;
}

export interface EmployeeForSave {
  id: string;
  type: EmployeeType;
  /**
   * Universal subtype tag. Pay-model coupling (read by `isUnitsRate` below):
   *   - STORE_KEEPER: null/TEMPORARY → units × rate (back-compat — untagged
   *     SKs were temp historically); PERMANENT → basicPay.
   *   - ADMIN: TEMPORARY → units × rate; PERMANENT/null → basicPay
   *     (back-compat — untagged admins stay on basicPay).
   *   - Everyone else (Sup/Driver/Marketing/Assistant/QC/AE): always
   *     basicPay regardless of subtype (metadata only).
   */
  subtype?: StoreKeeperSubtype | null;
  name: string;
  branchId: string | null;
}

export interface DispatcherRecordForSave {
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  penalty: number;
  advance: number;
}

export interface EmployeeSalarySaveResult {
  basicPay: number;
  workingHours: number;
  hourlyWage: number;
  /** HOUR | DAY for Temporary store keepers; null when not applicable. */
  payMode: PayMode | null;
  kpiAllowance: number;
  petrolAllowance: number;
  otAllowance: number;
  otherAllowance: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoLindung: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  pcb: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

/**
 * Pure helper used by `POST /api/employee-payroll/[month]/[year]` to compute
 * what to persist on `EmployeeSalaryRecord`. Extracted so the per-type field
 * gating + statutory override + dispatcher combination logic is unit-testable
 * without DB plumbing.
 *
 * Per-type editable matrix (see `context/features/payroll-edit-permissions-spec.md`
 * + `context/features/admin-subtype-spec.md`):
 *   - SUPERVISOR / DRIVER → basicPay drives wage; workingHours and hourlyWage
 *     are forced to 0 regardless of payload.
 *   - ADMIN (Permanent or untagged) → basicPay drives wage; same gating as
 *     Sup/Driver. Untagged → Permanent behaviour (back-compat).
 *   - ADMIN (Temporary) → workingHours × hourlyWage drives wage; mirrors
 *     Temp Store Keeper. payMode (HOUR | DAY) is a payslip-label distinction.
 *   - STORE_KEEPER (Permanent) → basicPay path like Sup/Admin.
 *   - STORE_KEEPER (Temporary, or untagged for back-compat) → workingHours
 *     × hourlyWage drives wage. payMode (HOUR | DAY) is a payslip-label
 *     distinction only — math is identical.
 */
export function computeEmployeeSalaryForSave(
  emp: EmployeeForSave,
  entry: EmployeeSavePayload,
  dispatcherRecord: DispatcherRecordForSave | null,
): EmployeeSalarySaveResult {
  // Pay-model gate via shared helper (see `lib/staff/employee-subtype.ts`).
  // TEMPORARY on any role → units × rate; PERMANENT on any role → basicPay;
  // null falls back to per-type defaults (untagged SK → temp, others → basicPay).
  const isUnitsRate = usesUnitsRate(emp.type as EmployeeTypeName, emp.subtype);

  const basicPay = isUnitsRate ? 0 : entry.basicPay;
  const workingHours = isUnitsRate ? entry.workingHours : 0;
  const hourlyWage = isUnitsRate ? entry.hourlyWage : 0;
  // payMode only meaningful for the units-rate branch; otherwise null.
  const payMode: PayMode | null = isUnitsRate ? entry.payMode ?? "HOUR" : null;

  const employeeGross = isUnitsRate
    ? calculateStoreKeeperGross(
        workingHours,
        hourlyWage,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otAllowance,
        entry.otherAllowance,
      )
    : calculateSupervisorGross(
        basicPay,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otAllowance,
        entry.otherAllowance,
      );

  const dispatcherGross = dispatcherRecord
    ? dispatcherRecord.baseSalary +
      dispatcherRecord.bonusTierEarnings +
      dispatcherRecord.petrolSubsidy
    : 0;

  const totalGross = employeeGross + dispatcherGross;
  // Pass kpiAllowance so the schedule p.12 bonus rule can fire when an
  // employee's base wage (excluding KPI) is ≤ RM5k but KPI pushes it over.
  const computed = calculateStatutory(totalGross, entry.kpiAllowance);

  // Honor client overrides verbatim (including 0). Without this, a user who
  // manually clears EPF can't save zero — server would silently overwrite.
  const epfEmployee = entry.epfEmployee ?? computed.epfEmployee;
  const socsoEmployee = entry.socsoEmployee ?? computed.socsoEmployee;
  const socsoLindung = entry.socsoLindung ?? computed.socsoLindung;
  const eisEmployee = entry.eisEmployee ?? computed.eisEmployee;
  const epfEmployer = entry.epfEmployer ?? computed.epfEmployer;
  const socsoEmployer = entry.socsoEmployer ?? computed.socsoEmployer;
  const eisEmployer = entry.eisEmployer ?? computed.eisEmployer;

  // Combined penalty/advance: dispatcher + manual employee entry
  const dispatcherPenalty = dispatcherRecord?.penalty ?? 0;
  const dispatcherAdvance = dispatcherRecord?.advance ?? 0;
  const penalty = entry.penalty + dispatcherPenalty;
  const advance = entry.advance + dispatcherAdvance;

  const netSalary = calculateNetSalary(
    totalGross,
    {
      epfEmployee,
      socsoEmployee,
      socsoLindung,
      eisEmployee,
      epfEmployer,
      socsoEmployer,
      eisEmployer,
      epfBonusRuleApplied: computed.epfBonusRuleApplied,
    },
    entry.pcb,
    penalty,
    advance,
  );

  return {
    basicPay,
    workingHours,
    hourlyWage,
    payMode,
    kpiAllowance: entry.kpiAllowance,
    petrolAllowance: entry.petrolAllowance,
    otAllowance: entry.otAllowance,
    otherAllowance: entry.otherAllowance,
    grossSalary: totalGross,
    epfEmployee,
    epfEmployer,
    socsoEmployee,
    socsoLindung,
    socsoEmployer,
    eisEmployee,
    eisEmployer,
    pcb: entry.pcb,
    penalty,
    advance,
    netSalary,
  };
}
