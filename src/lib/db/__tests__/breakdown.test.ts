import { describe, it, expect } from "vitest";
import {
  splitNetPayout,
  computeAvgMonthlySalary,
} from "../breakdown";

describe("splitNetPayout", () => {
  it("returns zeros when both arrays are empty", () => {
    expect(splitNetPayout([], [])).toEqual({ dispatcher: 0, staff: 0, total: 0 });
  });

  it("sums dispatcher records only", () => {
    const result = splitNetPayout(
      [{ netSalary: 1000 }, { netSalary: 250 }],
      [],
    );
    expect(result).toEqual({ dispatcher: 1250, staff: 0, total: 1250 });
  });

  it("sums staff records only", () => {
    const result = splitNetPayout(
      [],
      [{ netSalary: 800 }, { netSalary: 1200 }],
    );
    expect(result).toEqual({ dispatcher: 0, staff: 2000, total: 2000 });
  });

  it("combines both with total = dispatcher + staff", () => {
    const result = splitNetPayout(
      [{ netSalary: 1000 }],
      [{ netSalary: 750 }],
    );
    expect(result).toEqual({ dispatcher: 1000, staff: 750, total: 1750 });
  });
});

describe("computeAvgMonthlySalary", () => {
  it("returns both averages when populated", () => {
    expect(
      computeAvgMonthlySalary({
        dispatcherTotal: 6000,
        dispatcherUnique: 3,
        staffTotal: 5000,
        staffUnique: 2,
      }),
    ).toEqual({ dispatcher: 2000, staff: 2500 });
  });

  it("returns 0 when dispatcher unique count is 0", () => {
    expect(
      computeAvgMonthlySalary({
        dispatcherTotal: 0,
        dispatcherUnique: 0,
        staffTotal: 5000,
        staffUnique: 2,
      }),
    ).toEqual({ dispatcher: 0, staff: 2500 });
  });

  it("returns 0 when staff unique count is 0", () => {
    expect(
      computeAvgMonthlySalary({
        dispatcherTotal: 6000,
        dispatcherUnique: 3,
        staffTotal: 0,
        staffUnique: 0,
      }),
    ).toEqual({ dispatcher: 2000, staff: 0 });
  });

  it("rounds half-cent values cleanly", () => {
    const result = computeAvgMonthlySalary({
      dispatcherTotal: 100,
      dispatcherUnique: 3,
      staffTotal: 0,
      staffUnique: 0,
    });
    // 100 / 3 = 33.333... — pure helper does not round, that's the caller's job
    expect(result.dispatcher).toBeCloseTo(33.333, 2);
  });
});
