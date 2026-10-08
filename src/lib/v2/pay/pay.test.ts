import { describe, expect, it } from "vitest";
import { addBound, blankConfig, boundRanges, configProblems, parseConfig, removeBound, setBound, setByVehicle, type RuleConfig } from "./config";
import { boundIndex, computePay, computeRule, toCents, type Parcels } from "./engine";
import { inForce, periodFromInput, periodToInput, pickAssignments, type AssignmentRow, type Context } from "./resolve";

const parcels = (weights: number[], cats?: string): Parcels => ({ w: weights, c: cats ?? "n".repeat(weights.length) });
const many = (n: number, weight = 1) => parcels(Array.from({ length: n }, () => weight));

// FT KPI as described in the spec: nothing up to 1,400 parcels, then two paid tiers.
const kpi = (basis: "whole" | "marginal"): RuleConfig => ({
  ...blankConfig({ tiers: [1400, 2600, null] }),
  basis,
  values: [[[0]], [[0.2]], [[0.3]]],
});

describe("boundIndex", () => {
  it("puts a value on an edge in the range that edge closes", () => {
    expect(boundIndex(5, [5, 10, null])).toBe(0);
    expect(boundIndex(5.01, [5, 10, null])).toBe(1);
    expect(boundIndex(10, [5, 10, null])).toBe(1);
    expect(boundIndex(999, [5, 10, null])).toBe(2);
    expect(boundIndex(0, [null])).toBe(0);
  });
});

describe("toCents", () => {
  it("rounds units × rate once, half up", () => {
    expect(toCents(1, 1.4)).toBe(140);
    expect(toCents(3, 0.005)).toBe(2); // 1.5 cents
    expect(toCents(7, 0.1234)).toBe(86); // 86.38 cents
    expect(toCents(1201, 0.6)).toBe(72060);
  });
});

describe("computeRule: count tiers", () => {
  it("whole: the tier reached prices every parcel", () => {
    const r = computeRule(kpi("whole"), many(3000), "BIKE");
    expect(r.units).toBe(3000);
    expect(r.cents).toBe(90000); // 3000 × 0.30
    expect(r.groups).toEqual([{ tier: 2, band: 0, units: 3000, rate: 0.3, cents: 90000 }]);
  });

  it("marginal: each parcel is priced by its own position", () => {
    const r = computeRule(kpi("marginal"), many(3000), "BIKE");
    expect(r.cents).toBe(36000); // 1,400 × 0 + 1,200 × 0.20 + 400 × 0.30
    expect(r.groups.map((g) => [g.tier, g.units])).toEqual([[0, 1400], [1, 1200], [2, 400]]);
  });

  it("pays nothing below the first paid tier, either way", () => {
    expect(computeRule(kpi("whole"), many(1400), "BIKE").cents).toBe(0);
    expect(computeRule(kpi("marginal"), many(1400), "BIKE").cents).toBe(0);
    expect(computeRule(kpi("whole"), many(1401), "BIKE").cents).toBe(28020); // 1,401 × 0.20
    expect(computeRule(kpi("marginal"), many(1401), "BIKE").cents).toBe(20); // only parcel 1,401
  });
});

describe("computeRule: weight bands × vehicle", () => {
  const card: RuleConfig = {
    ...blankConfig({ bands: [5, 10, null], byVehicle: true }),
    values: [[[1, 1.2, 1.5], [1.4, 1.6, 2], [2.2, 2.5, 3]]],
  };

  it("prices each parcel by its band and the dispatcher's vehicle", () => {
    const p = parcels([5, 5.01, 10, 10.5, 0.2]);
    const bike = computeRule(card, p, "BIKE");
    expect(bike.groups.map((g) => [g.band, g.units, g.rate])).toEqual([[0, 2, 1], [1, 2, 1.4], [2, 1, 2.2]]);
    expect(bike.cents).toBe(200 + 280 + 220);
    expect(computeRule(card, p, "LORRY").cents).toBe(300 + 400 + 300);
  });

  it("marginal tiers follow delivery order across bands", () => {
    const tiered: RuleConfig = {
      ...blankConfig({ tiers: [2, null], bands: [5, null] }),
      basis: "marginal",
      values: [[[1], [2]], [[10], [20]]],
    };
    // Heavy first: parcels 1–2 are tier 0, parcel 3 (light) is tier 1.
    expect(computeRule(tiered, parcels([8, 8, 1]), "CAR").cents).toBe(200 + 200 + 1000);
    // Light first: the heavy parcel is the 3rd.
    expect(computeRule(tiered, parcels([1, 1, 8]), "CAR").cents).toBe(100 + 100 + 2000);
  });
});

describe("computeRule: flat and units", () => {
  it("flat: one amount for the tier the month reaches", () => {
    const attendance: RuleConfig = { ...blankConfig({ tiers: [999, null] }), valueType: "flat", values: [[[0]], [[100]]] };
    expect(computeRule(attendance, many(999), "BIKE").cents).toBe(0);
    expect(computeRule(attendance, many(1000), "BIKE").cents).toBe(10000);
    const fixed: RuleConfig = { ...blankConfig(), valueType: "flat", values: [[[350]]] };
    expect(computeRule(fixed, many(0), "BIKE").cents).toBe(35000);
  });

  it("counts only the parcels of its unit", () => {
    const scRtn: RuleConfig = { ...blankConfig(), unit: "sc_rtn", values: [[[0.6]]] };
    const p = parcels([1, 2, 3, 4, 5], "nrnsr");
    expect(computeRule(scRtn, p, "BIKE")).toMatchObject({ units: 2, cents: 120 });
    expect(computeRule({ ...blankConfig(), values: [[[1]]] }, p, "BIKE").units).toBe(2);
  });
});

describe("computePay", () => {
  it("adds earnings and subtracts deductions", () => {
    const pay = computePay(many(10), "BIKE", [
      { kind: "PARCEL", ruleId: "r1", versionId: "v1", name: "PT card", config: { ...blankConfig(), values: [[[1]]] } },
      { kind: "FUEL", ruleId: "r2", versionId: "v2", name: "Fuel", config: { ...blankConfig(), values: [[[0.25]]] } },
      { kind: "DEDUCTION", ruleId: "r3", versionId: "v3", name: "Uniform", config: { ...blankConfig(), valueType: "flat", values: [[[5]]] } },
    ]);
    expect(pay.earningsCents).toBe(1250);
    expect(pay.deductionCents).toBe(500);
    expect(pay.netCents).toBe(750);
    expect(pay.lines.map((l) => l.kind)).toEqual(["PARCEL", "FUEL", "DEDUCTION"]);
  });
});

describe("config validation", () => {
  it("accepts a well-formed config", () => {
    expect(configProblems(kpi("whole"))).toEqual([]);
    expect(parseConfig(kpi("marginal"))).not.toBeNull();
  });

  it("requires an open last tier and band, ascending whole-number tiers", () => {
    const keys = (c: RuleConfig) => configProblems(c).map((p) => p.key);
    expect(keys({ ...kpi("whole"), tiers: [1400, 2600, 3000] })).toContain("rule.err.lastTierOpen");
    expect(keys({ ...kpi("whole"), tiers: [2600, 1400, null] })).toContain("rule.err.increasing");
    expect(keys({ ...kpi("whole"), tiers: [1400.5, 2600, null] })).toContain("rule.err.wholeNumber");
    expect(keys({ ...kpi("whole"), tiers: [null, 2600, null] })).toContain("rule.err.onlyLastOpen");
    expect(keys({ ...blankConfig({ bands: [5, 5, null] }) })).toContain("rule.err.increasing");
  });

  it("rejects mismatched rate matrices, sub-cent precision and banded flat amounts", () => {
    expect(configProblems({ ...kpi("whole"), values: [[[0]], [[0.2]]] }).map((p) => p.key)).toEqual(["rule.err.shape"]);
    expect(configProblems({ ...blankConfig(), values: [[[0.12345]]] }).map((p) => p.key)).toEqual(["rule.err.rateDecimals"]);
    expect(configProblems({ ...blankConfig({ bands: [5, null] }), valueType: "flat" }).map((p) => p.key)).toContain("rule.err.flatBands");
    expect(parseConfig({ ...blankConfig(), values: [[[-1]]] })).toBeNull();
    expect(parseConfig({ nonsense: true })).toBeNull();
  });
});

describe("editor operations keep configs valid", () => {
  it("adds a range below the open one, copying its rates", () => {
    const c = addBound({ ...blankConfig({ bands: [5, null] }), values: [[[1], [2]]] }, "bands");
    expect(c.bands).toEqual([5, 10, null]);
    expect(c.values).toEqual([[[1], [2], [2]]]);
    expect(configProblems(c)).toEqual([]);
    expect(addBound(blankConfig(), "tiers").tiers).toEqual([1000, null]);
  });

  it("removes a range and its rates; the open range stays", () => {
    const c = removeBound(kpi("whole"), "tiers", 1);
    expect(c.tiers).toEqual([1400, null]);
    expect(c.values).toEqual([[[0]], [[0.3]]]);
    expect(removeBound(c, "tiers", 1)).toBe(c);
  });

  it("edits an edge; out-of-order edits are reported, not hidden", () => {
    expect(configProblems(setBound(kpi("whole"), "tiers", 0, 3000)).map((p) => p.key)).toContain("rule.err.increasing");
    expect(setBound(kpi("whole"), "tiers", 2, 5).tiers).toEqual([1400, 2600, null]);
  });

  it("switches between one rate and a rate per vehicle", () => {
    const c = setByVehicle({ ...blankConfig(), values: [[[0.6]]] }, true);
    expect(c.values).toEqual([[[0.6, 0.6, 0.6]]]);
    expect(configProblems(c)).toEqual([]);
    expect(setByVehicle(c, false).values).toEqual([[[0.6]]]);
  });

  it("labels ranges the way people write them", () => {
    expect(boundRanges([1400, 2600, null], 1)).toEqual([{ from: 0, to: 1400 }, { from: 1401, to: 2600 }, { from: 2601, to: null }]);
    expect(boundRanges([5, 10, null], 0.01)).toEqual([{ from: 0, to: 5 }, { from: 5.01, to: 10 }, { from: 10.01, to: null }]);
  });
});

describe("rule resolution", () => {
  const at = (n: number) => new Date(2026, 0, n);
  const row = (id: string, over: Partial<AssignmentRow>): AssignmentRow => ({
    id, kind: "PARCEL", ruleId: id, branchId: null, dispatcherId: null, employment: null, effectiveFrom: 202601, createdAt: at(1), ...over,
  });
  const ctx: Context = { period: 202611, branchId: "kul", dispatcherId: "d1", employment: "PART_TIME" };
  const pick = (rows: AssignmentRow[], c: Context = ctx) => pickAssignments(rows, c).get("PARCEL")?.id ?? null;

  it("most specific wins: dispatcher > outlet + FT/PT > outlet > FT/PT > everyone", () => {
    const rows = [
      row("all", {}),
      row("pt", { employment: "PART_TIME" }),
      row("kul", { branchId: "kul" }),
      row("kul-pt", { branchId: "kul", employment: "PART_TIME" }),
      row("d1", { dispatcherId: "d1" }),
    ];
    expect(pick(rows)).toBe("d1");
    expect(pick(rows.slice(0, 4))).toBe("kul-pt");
    expect(pick(rows.slice(0, 3))).toBe("kul");
    expect(pick(rows.slice(0, 2))).toBe("pt");
    expect(pick(rows.slice(0, 1))).toBe("all");
  });

  it("ignores assignments for other people, outlets, FT/PT or later months", () => {
    const rows = [
      row("all", {}),
      row("other-d", { dispatcherId: "d2" }),
      row("other-outlet", { branchId: "sgr" }),
      row("ft", { employment: "FULL_TIME" }),
      row("next-year", { branchId: "kul", effectiveFrom: 202701 }),
    ];
    expect(pick(rows)).toBe("all");
  });

  it("FT/PT-only assignments don't match a dispatcher without a profile", () => {
    expect(pick([row("all", {}), row("pt", { employment: "PART_TIME" })], { ...ctx, employment: null })).toBe("all");
  });

  it("at equal specificity the later month wins, then the newer row", () => {
    expect(pick([row("old", { branchId: "kul", effectiveFrom: 202601 }), row("dec", { branchId: "kul", effectiveFrom: 202610 })])).toBe("dec");
    expect(pick([row("first", { createdAt: at(1) }), row("second", { createdAt: at(2) })])).toBe("second");
  });

  it("resolves each kind separately", () => {
    const got = pickAssignments([row("card", {}), row("fuel", { kind: "FUEL" }), row("kpi", { kind: "KPI", employment: "FULL_TIME" })], ctx);
    expect([...got.keys()]).toEqual(["PARCEL", "FUEL"]);
  });

  it("finds the version in force for a month", () => {
    const versions = [{ effectiveFrom: 202601, v: "jan" }, { effectiveFrom: 202611, v: "nov" }, { effectiveFrom: 202701, v: "next" }];
    expect(inForce(versions, 202610)?.v).toBe("jan");
    expect(inForce(versions, 202611)?.v).toBe("nov");
    expect(inForce(versions, 202512)).toBeNull();
  });

  it("round-trips month inputs", () => {
    expect(periodFromInput("2026-11")).toBe(202611);
    expect(periodToInput(202611)).toBe("2026-11");
    expect(periodFromInput("2026-13")).toBeNull();
    expect(periodFromInput("bad")).toBeNull();
  });
});
