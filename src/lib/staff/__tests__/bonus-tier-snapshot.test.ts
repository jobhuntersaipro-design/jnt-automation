import { describe, it, expect } from "vitest";
import { readBonusTierSnapshot } from "../bonus-tier-snapshot";

describe("readBonusTierSnapshot", () => {
  it("returns null result when snapshot is null/undefined", () => {
    expect(readBonusTierSnapshot(null)).toBeNull();
    expect(readBonusTierSnapshot(undefined)).toBeNull();
  });

  it("returns legacy shape — { orderThreshold, legacyAmount, tiers: null }", () => {
    const result = readBonusTierSnapshot({
      orderThreshold: 2000,
      incentiveAmount: 200,
    });
    expect(result).toEqual({
      orderThreshold: 2000,
      tiers: null,
      legacyAmount: 200,
    });
  });

  it("returns new shape — { orderThreshold, tiers, legacyAmount: null }", () => {
    const tiers = [
      { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
      { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
      { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
    ];
    const result = readBonusTierSnapshot({ orderThreshold: 2000, tiers });
    expect(result).toEqual({
      orderThreshold: 2000,
      tiers,
      legacyAmount: null,
    });
  });

  it("throws typed error on malformed input (array)", () => {
    expect(() => readBonusTierSnapshot([])).toThrow(/bonus tier snapshot/i);
  });

  it("throws typed error on malformed input (missing orderThreshold)", () => {
    expect(() => readBonusTierSnapshot({ incentiveAmount: 200 })).toThrow(
      /bonus tier snapshot/i,
    );
  });

  it("throws typed error on malformed input (has neither tiers nor incentiveAmount)", () => {
    expect(() => readBonusTierSnapshot({ orderThreshold: 2000 })).toThrow(
      /bonus tier snapshot/i,
    );
  });
});
