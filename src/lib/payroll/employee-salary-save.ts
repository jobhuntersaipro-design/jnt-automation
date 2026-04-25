import {
  calculateStatutory,
  calculateNetSalary,
  calculateSupervisorGross,
  calculateStoreKeeperGross,
} from "./statutory";
import type { EmployeeType } from "@/generated/prisma/client";

export interface EmployeeSavePayload {
  employeeId: string;
  basicPay: number;
  workingHours: number;
  hourlyWage: number;
  kpiAllowance: number;
  petrolAllowance: number;
  otherAllowance: number;
  pcb: number;
  penalty: number;
  advance: number;
  // Optional statutory overrides — when present, persist verbatim (including 0).
  // When omitted, fall back to auto-calc from totalGross.
  epfEmployee?: number;
  socsoEmployee?: number;
  eisEmployee?: number;
  epfEmployer?: number;
  socsoEmployer?: number;
  eisEmployer?: number;
}

export interface EmployeeForSave {
  id: string;
  type: EmployeeType;
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
  kpiAllowance: number;
  petrolAllowance: number;
  otherAllowance: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
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
 * Per-type editable matrix (see `context/features/payroll-edit-permissions-spec.md`):
 *   - SUPERVISOR / ADMIN → basicPay drives wage; workingHours and hourlyWage
 *     are forced to 0 regardless of payload.
 *   - STORE_KEEPER → workingHours × hourlyWage drives wage; basicPay is
 *     forced to 0 regardless of payload.
 */
export function computeEmployeeSalaryForSave(
  emp: EmployeeForSave,
  entry: EmployeeSavePayload,
  dispatcherRecord: DispatcherRecordForSave | null,
): EmployeeSalarySaveResult {
  const isStoreKeeper = emp.type === "STORE_KEEPER";

  const basicPay = isStoreKeeper ? 0 : entry.basicPay;
  const workingHours = isStoreKeeper ? entry.workingHours : 0;
  const hourlyWage = isStoreKeeper ? entry.hourlyWage : 0;

  const employeeGross = isStoreKeeper
    ? calculateStoreKeeperGross(
        workingHours,
        hourlyWage,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otherAllowance,
      )
    : calculateSupervisorGross(
        basicPay,
        entry.petrolAllowance,
        entry.kpiAllowance,
        entry.otherAllowance,
      );

  const dispatcherGross = dispatcherRecord
    ? dispatcherRecord.baseSalary +
      dispatcherRecord.bonusTierEarnings +
      dispatcherRecord.petrolSubsidy
    : 0;

  const totalGross = employeeGross + dispatcherGross;
  const computed = calculateStatutory(totalGross);

  // Honor client overrides verbatim (including 0). Without this, a user who
  // manually clears EPF can't save zero — server would silently overwrite.
  const epfEmployee = entry.epfEmployee ?? computed.epfEmployee;
  const socsoEmployee = entry.socsoEmployee ?? computed.socsoEmployee;
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
      eisEmployee,
      epfEmployer,
      socsoEmployer,
      eisEmployer,
    },
    entry.pcb,
    penalty,
    advance,
  );

  return {
    basicPay,
    workingHours,
    hourlyWage,
    kpiAllowance: entry.kpiAllowance,
    petrolAllowance: entry.petrolAllowance,
    otherAllowance: entry.otherAllowance,
    grossSalary: totalGross,
    epfEmployee,
    epfEmployer,
    socsoEmployee,
    socsoEmployer,
    eisEmployee,
    eisEmployer,
    pcb: entry.pcb,
    penalty,
    advance,
    netSalary,
  };
}
