import { describe, it, expect } from "vitest";
import {
  isValidStoreKeeperSubtype,
  validateSubtypeForType,
  resolveSubtypeUpdate,
  STORE_KEEPER_SUBTYPE_LABEL,
  STORE_KEEPER_SUBTYPE_CHIP_CLASS,
} from "../store-keeper-subtype";

describe("isValidStoreKeeperSubtype", () => {
  it("accepts TEMPORARY", () => {
    expect(isValidStoreKeeperSubtype("TEMPORARY")).toBe(true);
  });

  it("accepts PERMANENT", () => {
    expect(isValidStoreKeeperSubtype("PERMANENT")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidStoreKeeperSubtype("CASUAL")).toBe(false);
    expect(isValidStoreKeeperSubtype("temporary")).toBe(false);
    expect(isValidStoreKeeperSubtype("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidStoreKeeperSubtype(null)).toBe(false);
    expect(isValidStoreKeeperSubtype(undefined)).toBe(false);
    expect(isValidStoreKeeperSubtype(123)).toBe(false);
  });
});

describe("validateSubtypeForType", () => {
  it("accepts TEMPORARY for STORE_KEEPER", () => {
    expect(validateSubtypeForType("STORE_KEEPER", "TEMPORARY")).toEqual({ ok: true });
  });

  it("accepts PERMANENT for STORE_KEEPER", () => {
    expect(validateSubtypeForType("STORE_KEEPER", "PERMANENT")).toEqual({ ok: true });
  });

  it("accepts null for STORE_KEEPER (DB tolerance)", () => {
    expect(validateSubtypeForType("STORE_KEEPER", null)).toEqual({ ok: true });
  });

  it("accepts null for SUPERVISOR", () => {
    expect(validateSubtypeForType("SUPERVISOR", null)).toEqual({ ok: true });
  });

  it("accepts null for ADMIN", () => {
    expect(validateSubtypeForType("ADMIN", null)).toEqual({ ok: true });
  });

  it("accepts null for DRIVER", () => {
    expect(validateSubtypeForType("DRIVER", null)).toEqual({ ok: true });
  });

  it("rejects non-null subtype for SUPERVISOR", () => {
    const result = validateSubtypeForType("SUPERVISOR", "TEMPORARY");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/store keeper/i);
  });

  it("rejects non-null subtype for ADMIN", () => {
    const result = validateSubtypeForType("ADMIN", "PERMANENT");
    expect(result.ok).toBe(false);
  });

  it("rejects non-null subtype for DRIVER", () => {
    const result = validateSubtypeForType("DRIVER", "TEMPORARY");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid enum value for STORE_KEEPER", () => {
    const result = validateSubtypeForType("STORE_KEEPER", "CASUAL");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid/i);
  });
});

describe("resolveSubtypeUpdate (auto-clear rule for PATCH)", () => {
  it("forces null when effective type is not STORE_KEEPER, ignoring payload", () => {
    expect(
      resolveSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: "TEMPORARY" }),
    ).toBe(null);
    expect(
      resolveSubtypeUpdate({ effectiveType: "SUPERVISOR", payloadSubtype: "PERMANENT" }),
    ).toBe(null);
    expect(
      resolveSubtypeUpdate({ effectiveType: "DRIVER", payloadSubtype: "TEMPORARY" }),
    ).toBe(null);
  });

  it("returns null when effective type is not STORE_KEEPER and payload omits subtype", () => {
    expect(
      resolveSubtypeUpdate({ effectiveType: "ADMIN", payloadSubtype: undefined }),
    ).toBe(null);
  });

  it("preserves the supplied subtype for STORE_KEEPER", () => {
    expect(
      resolveSubtypeUpdate({ effectiveType: "STORE_KEEPER", payloadSubtype: "TEMPORARY" }),
    ).toBe("TEMPORARY");
    expect(
      resolveSubtypeUpdate({ effectiveType: "STORE_KEEPER", payloadSubtype: "PERMANENT" }),
    ).toBe("PERMANENT");
  });

  it("returns undefined for STORE_KEEPER when payload omits subtype (no change)", () => {
    // undefined = caller did not pass the field; preserve existing DB value.
    expect(
      resolveSubtypeUpdate({ effectiveType: "STORE_KEEPER", payloadSubtype: undefined }),
    ).toBe(undefined);
  });

  it("preserves explicit null for STORE_KEEPER (allows clearing)", () => {
    expect(
      resolveSubtypeUpdate({ effectiveType: "STORE_KEEPER", payloadSubtype: null }),
    ).toBe(null);
  });
});

describe("STORE_KEEPER_SUBTYPE_LABEL", () => {
  it("provides human-readable labels", () => {
    expect(STORE_KEEPER_SUBTYPE_LABEL.TEMPORARY).toBe("Temporary");
    expect(STORE_KEEPER_SUBTYPE_LABEL.PERMANENT).toBe("Permanent");
  });
});

describe("STORE_KEEPER_SUBTYPE_CHIP_CLASS", () => {
  it("provides distinct chip styles per subtype", () => {
    expect(STORE_KEEPER_SUBTYPE_CHIP_CLASS.TEMPORARY).toContain("orange");
    expect(STORE_KEEPER_SUBTYPE_CHIP_CLASS.PERMANENT).toContain("emerald");
    expect(STORE_KEEPER_SUBTYPE_CHIP_CLASS.TEMPORARY).not.toEqual(
      STORE_KEEPER_SUBTYPE_CHIP_CLASS.PERMANENT,
    );
  });
});
