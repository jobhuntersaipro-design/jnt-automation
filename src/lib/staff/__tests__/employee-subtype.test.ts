import { describe, it, expect } from "vitest";
import {
  isValidEmployeeSubtype,
  isValidEmployeeType,
  validateEmployeeSubtype,
  usesUnitsRate,
  EMPLOYEE_SUBTYPE_LABEL,
  EMPLOYEE_SUBTYPE_CHIP_CLASS,
  EMPLOYEE_SUBTYPE_VALUES,
  EMPLOYEE_TYPE_VALUES,
} from "../employee-subtype";

describe("isValidEmployeeType", () => {
  it("accepts all 4 legacy types", () => {
    expect(isValidEmployeeType("SUPERVISOR")).toBe(true);
    expect(isValidEmployeeType("ADMIN")).toBe(true);
    expect(isValidEmployeeType("STORE_KEEPER")).toBe(true);
    expect(isValidEmployeeType("DRIVER")).toBe(true);
  });

  it("accepts all 4 new types", () => {
    expect(isValidEmployeeType("MARKETING")).toBe(true);
    expect(isValidEmployeeType("ASSISTANT")).toBe(true);
    expect(isValidEmployeeType("QUALITY_CONTROL")).toBe(true);
    expect(isValidEmployeeType("ACCOUNT_EXECUTIVE")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidEmployeeType("MANAGER")).toBe(false);
    expect(isValidEmployeeType("supervisor")).toBe(false);
    expect(isValidEmployeeType("QUALITY CONTROL")).toBe(false);
    expect(isValidEmployeeType("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidEmployeeType(null)).toBe(false);
    expect(isValidEmployeeType(undefined)).toBe(false);
    expect(isValidEmployeeType(123)).toBe(false);
    expect(isValidEmployeeType({})).toBe(false);
  });
});

describe("isValidEmployeeSubtype", () => {
  it("accepts TEMPORARY", () => {
    expect(isValidEmployeeSubtype("TEMPORARY")).toBe(true);
  });

  it("accepts PERMANENT", () => {
    expect(isValidEmployeeSubtype("PERMANENT")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidEmployeeSubtype("CASUAL")).toBe(false);
    expect(isValidEmployeeSubtype("temporary")).toBe(false);
    expect(isValidEmployeeSubtype("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidEmployeeSubtype(null)).toBe(false);
    expect(isValidEmployeeSubtype(undefined)).toBe(false);
    expect(isValidEmployeeSubtype(123)).toBe(false);
  });
});

describe("validateEmployeeSubtype (universal — type-agnostic)", () => {
  it("accepts null (no subtype)", () => {
    expect(validateEmployeeSubtype(null)).toEqual({ ok: true });
  });

  it("accepts undefined (no subtype)", () => {
    expect(validateEmployeeSubtype(undefined)).toEqual({ ok: true });
  });

  it("accepts TEMPORARY", () => {
    expect(validateEmployeeSubtype("TEMPORARY")).toEqual({ ok: true });
  });

  it("accepts PERMANENT", () => {
    expect(validateEmployeeSubtype("PERMANENT")).toEqual({ ok: true });
  });

  it("rejects invalid string", () => {
    const result = validateEmployeeSubtype("CASUAL");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid|temporary|permanent/i);
  });

  it("rejects non-string", () => {
    const result = validateEmployeeSubtype(123);
    expect(result.ok).toBe(false);
  });
});

describe("EMPLOYEE_TYPE_VALUES", () => {
  it("exports exactly 8 values", () => {
    expect(EMPLOYEE_TYPE_VALUES).toHaveLength(8);
  });

  it("includes all 4 legacy types", () => {
    expect(EMPLOYEE_TYPE_VALUES).toContain("SUPERVISOR");
    expect(EMPLOYEE_TYPE_VALUES).toContain("ADMIN");
    expect(EMPLOYEE_TYPE_VALUES).toContain("STORE_KEEPER");
    expect(EMPLOYEE_TYPE_VALUES).toContain("DRIVER");
  });

  it("includes all 4 new types", () => {
    expect(EMPLOYEE_TYPE_VALUES).toContain("MARKETING");
    expect(EMPLOYEE_TYPE_VALUES).toContain("ASSISTANT");
    expect(EMPLOYEE_TYPE_VALUES).toContain("QUALITY_CONTROL");
    expect(EMPLOYEE_TYPE_VALUES).toContain("ACCOUNT_EXECUTIVE");
  });
});

describe("usesUnitsRate — universal pay-model gate", () => {
  it("TEMPORARY routes every type to units × rate", () => {
    expect(usesUnitsRate("SUPERVISOR", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("ADMIN", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("STORE_KEEPER", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("DRIVER", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("MARKETING", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("ASSISTANT", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("QUALITY_CONTROL", "TEMPORARY")).toBe(true);
    expect(usesUnitsRate("ACCOUNT_EXECUTIVE", "TEMPORARY")).toBe(true);
  });

  it("PERMANENT routes every type to basicPay", () => {
    expect(usesUnitsRate("SUPERVISOR", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("ADMIN", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("STORE_KEEPER", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("DRIVER", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("MARKETING", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("ASSISTANT", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("QUALITY_CONTROL", "PERMANENT")).toBe(false);
    expect(usesUnitsRate("ACCOUNT_EXECUTIVE", "PERMANENT")).toBe(false);
  });

  it("null subtype: untagged STORE_KEEPER stays on units × rate (back-compat)", () => {
    expect(usesUnitsRate("STORE_KEEPER", null)).toBe(true);
    expect(usesUnitsRate("STORE_KEEPER", undefined)).toBe(true);
  });

  it("null subtype: everything except STORE_KEEPER falls to basicPay", () => {
    expect(usesUnitsRate("SUPERVISOR", null)).toBe(false);
    expect(usesUnitsRate("ADMIN", null)).toBe(false);
    expect(usesUnitsRate("DRIVER", null)).toBe(false);
    expect(usesUnitsRate("MARKETING", null)).toBe(false);
    expect(usesUnitsRate("ASSISTANT", null)).toBe(false);
    expect(usesUnitsRate("QUALITY_CONTROL", null)).toBe(false);
    expect(usesUnitsRate("ACCOUNT_EXECUTIVE", null)).toBe(false);
  });
});

describe("EMPLOYEE_SUBTYPE_VALUES", () => {
  it("exports exactly 2 values in canonical order", () => {
    expect(EMPLOYEE_SUBTYPE_VALUES).toEqual(["TEMPORARY", "PERMANENT"]);
  });
});

describe("EMPLOYEE_SUBTYPE_LABEL", () => {
  it("provides human-readable labels", () => {
    expect(EMPLOYEE_SUBTYPE_LABEL.TEMPORARY).toBe("Temporary");
    expect(EMPLOYEE_SUBTYPE_LABEL.PERMANENT).toBe("Permanent");
  });
});

describe("EMPLOYEE_SUBTYPE_CHIP_CLASS", () => {
  it("provides distinct chip styles per subtype", () => {
    expect(EMPLOYEE_SUBTYPE_CHIP_CLASS.TEMPORARY).toContain("orange");
    expect(EMPLOYEE_SUBTYPE_CHIP_CLASS.PERMANENT).toContain("emerald");
    expect(EMPLOYEE_SUBTYPE_CHIP_CLASS.TEMPORARY).not.toEqual(
      EMPLOYEE_SUBTYPE_CHIP_CLASS.PERMANENT,
    );
  });
});
