/**
 * Store Keeper Subtype helpers.
 *
 * Subtype is metadata-only (Temporary / Permanent). Pay formula, statutory
 * math, and payslip rendering are unaffected. Subtype is null for any
 * non-store-keeper employee — both the API (`validateSubtypeForType`) and the
 * PATCH route (`resolveSubtypeUpdate`) enforce that invariant.
 */

export type StoreKeeperSubtype = "TEMPORARY" | "PERMANENT";

export type EmployeeTypeName = "SUPERVISOR" | "ADMIN" | "STORE_KEEPER" | "DRIVER";

export const STORE_KEEPER_SUBTYPE_VALUES: readonly StoreKeeperSubtype[] = [
  "TEMPORARY",
  "PERMANENT",
] as const;

export const STORE_KEEPER_SUBTYPE_LABEL: Record<StoreKeeperSubtype, string> = {
  TEMPORARY: "Temporary",
  PERMANENT: "Permanent",
};

export const STORE_KEEPER_SUBTYPE_CHIP_CLASS: Record<StoreKeeperSubtype, string> = {
  TEMPORARY: "bg-orange-50 text-orange-700",
  PERMANENT: "bg-emerald-50 text-emerald-700",
};

export function isValidStoreKeeperSubtype(v: unknown): v is StoreKeeperSubtype {
  return v === "TEMPORARY" || v === "PERMANENT";
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a subtype value against a chosen employee type.
 *
 * Rules:
 * - `null` is always allowed (DB tolerance + non-store-keeper default).
 * - Any non-null subtype on a non-STORE_KEEPER type is rejected.
 * - On STORE_KEEPER, only enum values from `STORE_KEEPER_SUBTYPE_VALUES`
 *   are accepted.
 */
export function validateSubtypeForType(
  type: EmployeeTypeName,
  subtype: unknown,
): ValidationResult {
  if (subtype === null || subtype === undefined) return { ok: true };

  if (type !== "STORE_KEEPER") {
    return {
      ok: false,
      error: "Subtype only applies to store keeper",
    };
  }

  if (!isValidStoreKeeperSubtype(subtype)) {
    return { ok: false, error: "Invalid store keeper subtype" };
  }

  return { ok: true };
}

/**
 * Resolve the subtype value to write during a PATCH update.
 *
 * - Returns `null` whenever the effective type is not STORE_KEEPER (auto-clear
 *   safety net — even if the UI forgets to clear, the row stays consistent).
 * - For STORE_KEEPER:
 *   - `undefined` payload → `undefined` return (caller skips the field, DB
 *     value preserved).
 *   - `null` payload → `null` return (explicit clear).
 *   - Valid enum payload → return as-is.
 */
export function resolveSubtypeUpdate(opts: {
  effectiveType: EmployeeTypeName;
  payloadSubtype: StoreKeeperSubtype | null | undefined;
}): StoreKeeperSubtype | null | undefined {
  if (opts.effectiveType !== "STORE_KEEPER") return null;
  return opts.payloadSubtype;
}
