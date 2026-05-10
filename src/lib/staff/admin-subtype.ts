/**
 * Admin Subtype helpers.
 *
 * Mirrors `store-keeper-subtype.ts` for the ADMIN role. Both subtype columns
 * reuse the same Postgres enum (`StoreKeeperSubtype` — TEMPORARY / PERMANENT);
 * only the column name differs. Untagged Admin (`adminSubtype = null`) defaults
 * to PERMANENT behaviour (basicPay) — different from SK where untagged → TEMP —
 * so existing Admin rows continue to use monthly basic pay until explicitly
 * tagged Temporary.
 *
 * Pay logic effects (see `computeEmployeeSalaryForSave`):
 *   - ADMIN + TEMPORARY → workingHours × hourlyWage (mirrors SK Temporary).
 *   - ADMIN + PERMANENT → basicPay (today's behaviour).
 *   - ADMIN + null      → basicPay (today's behaviour, back-compat).
 */
import type { StoreKeeperSubtype } from "@/generated/prisma/client";

/** Same enum as `StoreKeeperSubtype` — re-exported under an Admin-specific name. */
export type AdminSubtype = StoreKeeperSubtype;

import type { EmployeeTypeName } from "./store-keeper-subtype";
export type { EmployeeTypeName };

export const ADMIN_SUBTYPE_VALUES: readonly AdminSubtype[] = [
  "TEMPORARY",
  "PERMANENT",
] as const;

export const ADMIN_SUBTYPE_LABEL: Record<AdminSubtype, string> = {
  TEMPORARY: "Temporary",
  PERMANENT: "Permanent",
};

export const ADMIN_SUBTYPE_CHIP_CLASS: Record<AdminSubtype, string> = {
  TEMPORARY: "bg-orange-50 text-orange-700",
  PERMANENT: "bg-emerald-50 text-emerald-700",
};

export function isValidAdminSubtype(v: unknown): v is AdminSubtype {
  return v === "TEMPORARY" || v === "PERMANENT";
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a subtype value against a chosen employee type.
 *
 * Rules:
 * - `null` is always allowed (DB tolerance + non-admin default).
 * - Any non-null subtype on a non-ADMIN type is rejected.
 * - On ADMIN, only enum values from `ADMIN_SUBTYPE_VALUES` are accepted.
 */
export function validateAdminSubtypeForType(
  type: EmployeeTypeName,
  subtype: unknown,
): ValidationResult {
  if (subtype === null || subtype === undefined) return { ok: true };

  if (type !== "ADMIN") {
    return {
      ok: false,
      error: "Subtype only applies to admin",
    };
  }

  if (!isValidAdminSubtype(subtype)) {
    return { ok: false, error: "Invalid admin subtype" };
  }

  return { ok: true };
}

/**
 * Resolve the subtype value to write during a PATCH update.
 *
 * - Returns `null` whenever the effective type is not ADMIN (auto-clear safety
 *   net — even if the UI forgets to clear, the row stays consistent).
 * - For ADMIN:
 *   - `undefined` payload → `undefined` return (caller skips the field).
 *   - `null` payload → `null` return (explicit clear).
 *   - Valid enum payload → return as-is.
 */
export function resolveAdminSubtypeUpdate(opts: {
  effectiveType: EmployeeTypeName;
  payloadSubtype: AdminSubtype | null | undefined;
}): AdminSubtype | null | undefined {
  if (opts.effectiveType !== "ADMIN") return null;
  return opts.payloadSubtype;
}
