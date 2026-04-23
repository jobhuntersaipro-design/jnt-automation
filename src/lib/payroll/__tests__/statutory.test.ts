import { describe, it, expect } from "vitest";
import { calculateSupervisorGross, calculateStoreKeeperGross } from "../statutory";

describe("calculateSupervisorGross", () => {
  it("sums basicPay + all three allowances (4-arg legacy call)", () => {
    expect(calculateSupervisorGross(3000, 100, 200, 50)).toBe(3350);
  });

  it("treats omitted hourly params as zero (backward compatible)", () => {
    // Old callers that pass only 4 args must keep working.
    expect(calculateSupervisorGross(3000, 0, 0, 0)).toBe(3000);
  });

  it("adds workingHours × hourlyWage when both are provided", () => {
    // Supervisor on a monthly base who also logged 20 OT hours at RM15/hr.
    expect(calculateSupervisorGross(3000, 100, 0, 0, 20, 15)).toBe(3400);
  });

  it("adds zero from hourly when hourlyWage is zero even with non-zero hours", () => {
    // Info-only hours entry on a Supervisor with no hourly rate set.
    expect(calculateSupervisorGross(3000, 0, 0, 0, 40, 0)).toBe(3000);
  });

  it("adds zero from hourly when workingHours is zero", () => {
    expect(calculateSupervisorGross(3000, 0, 0, 0, 0, 25)).toBe(3000);
  });
});

describe("calculateStoreKeeperGross", () => {
  it("multiplies hours × rate and adds allowances", () => {
    expect(calculateStoreKeeperGross(160, 10, 100, 50, 20)).toBe(1770);
  });

  it("returns the allowances sum when hours = 0", () => {
    expect(calculateStoreKeeperGross(0, 10, 100, 50, 20)).toBe(170);
  });
});
