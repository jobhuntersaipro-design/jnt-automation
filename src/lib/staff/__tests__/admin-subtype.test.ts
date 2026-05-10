import { describe, it, expect } from "vitest";
import {
  isValidAdminSubtype,
  validateAdminSubtypeForType,
  resolveAdminSubtypeUpdate,
  ADMIN_SUBTYPE_LABEL,
  ADMIN_SUBTYPE_CHIP_CLASS,
  ADMIN_SUBTYPE_VALUES,
} from "../admin-subtype";

describe("isValidAdminSubtype", () => {
  it("accepts TEMPORARY", () => {
    expect(isValidAdminSubtype("TEMPORARY")).toBe(true);
  });

  it("accepts PERMANENT", () => {
    expect(isValidAdminSubtype("PERMANENT")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidAdminSubtype("CASUAL")).toBe(false);
    expect(isValidAdminSubtype("temporary")).toBe(false);
    expect(isValidAdminSubtype("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidAdminSubtype(null)).toBe(false);
    expect(isValidAdminSubtype(undefined)).toBe(false);
    expect(isValidAdminSubtype(123)).toBe(false);
  });
});

describe("validateAdminSubtypeForType", () => {
  it("accepts TEMPORARY for ADMIN", () => {
    expect(validateAdminSubtypeForType("ADMIN", "TEMPORARY")).toEqual({ ok: true });
  });

  it("accepts PERMANENT for ADMIN", () => {
    expect(validateAdminSubtypeForType("ADMIN", "PERMANENT")).toEqual({ ok: true });
  });

  it("accepts null for ADMIN (DB tolerance)", () => {
    expect(validateAdminSubtypeForType("ADMIN", null)).toEqual({ ok: true });
  });

  it("accepts null for non-admin types", () => {
    expect(validateAdminSubtypeForType("SUPERVISOR", null)).toEqual({ ok: true });
    expect(validateAdminSubtypeForType("STORE_KEEPER", null)).toEqual({ ok: true });
    expect(validateAdminSubtypeForType("DRIVER", null)).toEqual({ ok: true });
  });

  it("rejects non-null subtype for SUPERVISOR", () => {
    const result = validateAdminSubtypeForType("SUPERVISOR", "TEMPORARY");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin/i);
  });

  it("rejects non-null subtype for STORE_KEEPER (uses storeKeeperSubtype instead)", () => {
    const result = validateAdminSubtypeForType("STORE_KEEPER", "PERMANENT");
    expect(result.ok).toBe(false);
  });

  it("rejects non-null subtype for DRIVER", () => {
    const result = validateAdminSubtypeForType("DRIVER", "TEMPORARY");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid enum value for ADMIN", () => {
    const result = validateAdminSubtypeForType("ADMIN", "CASUAL");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid/i);
  });
});

describe("resolveAdminSubtypeUpdate (auto-clear rule for PATCH)", () => {
  it("forces null when effective type is not ADMIN, ignoring payload", () => {
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "STORE_KEEPER", payloadSubtype: "TEMPORARY" }),
    ).toBe(null);
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "SUPERVISOR", payloadSubtype: "PERMANENT" }),
    ).toBe(null);
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "DRIVER", payloadSubtype: "TEMPORARY" }),
    ).toBe(null);
  });

  it("returns null when effective type is not ADMIN and payload omits subtype", () => {
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "SUPERVISOR", payloadSubtype: undefined }),
    ).toBe(null);
  });

  it("preserves the supplied subtype for ADMIN", () => {
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: "TEMPORARY" }),
    ).toBe("TEMPORARY");
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: "PERMANENT" }),
    ).toBe("PERMANENT");
  });

  it("returns undefined for ADMIN when payload omits subtype (no change)", () => {
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: undefined }),
    ).toBe(undefined);
  });

  it("preserves explicit null for ADMIN (allows clearing)", () => {
    expect(
      resolveAdminSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: null }),
    ).toBe(null);
  });
});

describe("ADMIN_SUBTYPE_LABEL", () => {
  it("provides human-readable labels", () => {
    expect(ADMIN_SUBTYPE_LABEL.TEMPORARY).toBe("Temporary");
    expect(ADMIN_SUBTYPE_LABEL.PERMANENT).toBe("Permanent");
  });
});

describe("ADMIN_SUBTYPE_CHIP_CLASS", () => {
  it("provides distinct chip styles per subtype", () => {
    expect(ADMIN_SUBTYPE_CHIP_CLASS.TEMPORARY).toContain("orange");
    expect(ADMIN_SUBTYPE_CHIP_CLASS.PERMANENT).toContain("emerald");
    expect(ADMIN_SUBTYPE_CHIP_CLASS.TEMPORARY).not.toEqual(
      ADMIN_SUBTYPE_CHIP_CLASS.PERMANENT,
    );
  });
});

describe("ADMIN_SUBTYPE_VALUES", () => {
  it("enumerates both values", () => {
    expect(ADMIN_SUBTYPE_VALUES).toEqual(["TEMPORARY", "PERMANENT"]);
  });
});
