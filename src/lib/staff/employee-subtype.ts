/**
 * Employee subtype (Temporary / Permanent).
 *
 * Universal across all EmployeeType values (Supervisor / Admin / Store
 * Keeper / Driver / Marketing / Assistant / Quality Control / Account
 * Executive). Stored on Employee.subtype as a nullable StoreKeeperSubtype
 * column — the Postgres enum name is kept for back-compat with the existing
 * type, even though the semantics are now universal.
 *
 * Pay-model semantics: subtype is METADATA ONLY for Sup/Driver/Marketing/
 * Assistant/QC/AE. SK + Admin retain their existing pay-model coupling —
 * see `computeEmployeeSalaryForSave` for the gate. The gate reads
 * `employee.subtype` (single column) instead of the legacy two-column shape.
 */

export type EmployeeSubtype = "TEMPORARY" | "PERMANENT";

export type EmployeeTypeName =
  | "SUPERVISOR"
  | "ADMIN"
  | "STORE_KEEPER"
  | "DRIVER"
  | "MARKETING"
  | "ASSISTANT"
  | "QUALITY_CONTROL"
  | "ACCOUNT_EXECUTIVE";

export const EMPLOYEE_SUBTYPE_VALUES: readonly EmployeeSubtype[] = [
  "TEMPORARY",
  "PERMANENT",
] as const;

export const EMPLOYEE_SUBTYPE_LABEL: Record<EmployeeSubtype, string> = {
  TEMPORARY: "Temporary",
  PERMANENT: "Permanent",
};

export const EMPLOYEE_SUBTYPE_CHIP_CLASS: Record<EmployeeSubtype, string> = {
  TEMPORARY: "bg-orange-50 text-orange-700",
  PERMANENT: "bg-emerald-50 text-emerald-700",
};

export const EMPLOYEE_TYPE_VALUES: readonly EmployeeTypeName[] = [
  "SUPERVISOR",
  "ADMIN",
  "STORE_KEEPER",
  "DRIVER",
  "MARKETING",
  "ASSISTANT",
  "QUALITY_CONTROL",
  "ACCOUNT_EXECUTIVE",
] as const;

export function isValidEmployeeSubtype(v: unknown): v is EmployeeSubtype {
  return v === "TEMPORARY" || v === "PERMANENT";
}

export function isValidEmployeeType(v: unknown): v is EmployeeTypeName {
  return (
    typeof v === "string" &&
    (EMPLOYEE_TYPE_VALUES as readonly string[]).includes(v)
  );
}

/**
 * Pay-model gate — single source of truth shared by client (payroll-tab),
 * server (`computeEmployeeSalaryForSave`), payslip rendering, and the
 * Employee.basicPay/hourlyWage column template.
 *
 * Rules:
 *  - subtype = TEMPORARY → units × rate (hours/days), regardless of type.
 *    The payroll row exposes the HOUR/DAY selector + per-unit rate inputs.
 *  - subtype = PERMANENT → basicPay, regardless of type.
 *  - subtype = null (untagged):
 *    - STORE_KEEPER → units × rate (back-compat — untagged SKs were temp
 *      before subtype existed; flipping them to basicPay would silently
 *      change saved totals).
 *    - Everything else → basicPay (today's behaviour preserved).
 */
export function usesUnitsRate(
  type: EmployeeTypeName,
  subtype: EmployeeSubtype | null | undefined,
): boolean {
  if (subtype === "TEMPORARY") return true;
  if (subtype === "PERMANENT") return false;
  return type === "STORE_KEEPER";
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a subtype value. Universal — every type accepts TEMPORARY or
 * PERMANENT, or `null` / `undefined` (unset).
 */
export function validateEmployeeSubtype(subtype: unknown): ValidationResult {
  if (subtype === null || subtype === undefined) return { ok: true };
  if (!isValidEmployeeSubtype(subtype)) {
    return { ok: false, error: "Invalid subtype — must be TEMPORARY or PERMANENT" };
  }
  return { ok: true };
}
