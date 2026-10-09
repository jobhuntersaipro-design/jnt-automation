import { describe, expect, it } from "vitest";
import type { ParsedRow } from "@/lib/upload/parser";
import { blankConfig, type RuleConfig } from "@/lib/v2/pay/config";
import type { AssignmentRow } from "@/lib/v2/pay/resolve";
import { payDispatcher, type VersionRow } from "./calc";
import { summariseRows } from "./file";

const row = (dispatcherId: string, weight: number, date: string | null, branchName = "KUL4602", dispatcherName = `Rider ${dispatcherId}`): ParsedRow => ({
  waybillNumber: `W${Math.random()}`,
  branchName,
  deliveryDate: date ? new Date(`${date}Z`) : null,
  dispatcherId,
  dispatcherName,
  billingWeight: weight,
});

describe("summariseRows", () => {
  it("finds the outlet and month the file is mostly about, and counts the rest", () => {
    const r = summariseRows([
      row("A1", 1, "2026-10-02T09:00:00"),
      row("A1", 2, "2026-10-03T09:00:00"),
      row("B2", 3, "2026-09-30T23:30:00"),
      row("B2", 4, "2026-10-05T10:00:00", "KUL4603"),
      row("B2", 5, null),
    ]);
    expect(r.ok && r.summary.outlet).toBe("KUL4602");
    expect(r.ok && r.summary.period).toBe(202610);
    expect(r.ok && r.summary.stats).toEqual({ rows: 5, otherOutlets: 1, otherMonths: 1, noDate: 1 });
  });

  it("orders each dispatcher's parcels by delivery time, undated last, ties in file order", () => {
    const r = summariseRows([
      row("A1", 3, "2026-10-03T09:00:00"),
      row("A1", 9, null),
      row("A1", 1, "2026-10-01T09:00:00"),
      row("A1", 2, "2026-10-03T09:00:00"),
      row("B2", 5, "2026-10-02T09:00:00", "KUL4602", "Ahmad"),
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.summary.dispatchers).toEqual([
      { extId: "B2", name: "Ahmad", parcels: { w: [5], c: "n" } },
      { extId: "A1", name: "Rider A1", parcels: { w: [1, 3, 2, 9], c: "nnnn" } },
    ]);
  });

  it.each([
    ["no rows", [], "run.err.noRows"],
    ["no outlet", [row("A1", 1, "2026-10-01T00:00:00", "")], "run.err.noOutlet"],
    ["no dates", [row("A1", 1, null)], "run.err.noMonth"],
  ])("refuses a file with %s", (_, rows, error) => {
    expect(summariseRows(rows)).toEqual({ ok: false, error });
  });
});

describe("payDispatcher", () => {
  const card: RuleConfig = { ...blankConfig({ bands: [5, null], byVehicle: true }), values: [[[1, 1.2, 1.5], [2, 2.2, 2.5]]] };
  const kpi: RuleConfig = { ...blankConfig({ tiers: [2, null] }), basis: "marginal", values: [[[0]], [[0.5]]] };
  const loan: RuleConfig = { ...blankConfig({ valueType: "flat" }), values: [[[50]]] };
  const versions: VersionRow[] = [
    { id: "v-card", ruleId: "card", effectiveFrom: 202601, config: card },
    { id: "v-kpi", ruleId: "kpi", effectiveFrom: 202601, config: kpi },
    { id: "v-loan", ruleId: "loan", effectiveFrom: 202601, config: loan },
    { id: "v-late", ruleId: "late", effectiveFrom: 202612, config: card },
  ];
  const at = (id: string, kind: AssignmentRow["kind"], ruleId: string, scope: Partial<AssignmentRow> = {}) => ({
    id,
    kind,
    ruleId,
    ruleName: ruleId,
    branchId: null,
    dispatcherId: null,
    employment: null,
    effectiveFrom: 202601,
    createdAt: new Date(2026, 0, 1),
    ...scope,
  });
  const base = {
    period: 202610,
    branchId: "kul",
    dispatcherId: "d1",
    parcels: { w: [1, 6, 1, 7], c: "nnnn" },
    versionsOf: (ruleId: string) => versions.filter((v) => v.ruleId === ruleId),
  };
  const everyone = [at("a1", "PARCEL", "card"), at("a2", "KPI", "kpi", { employment: "FULL_TIME" }), at("a3", "DEDUCTION", "loan", { dispatcherId: "d1" })];

  it("takes advances back last, never below RM 0 net", () => {
    const profile = { vehicle: "CAR" as const, employment: "PART_TIME" as const, effectiveFrom: 202610 };
    const card = [at("a1", "PARCEL", "card")];
    const some = payDispatcher({ ...base, profile, assignments: card, advanceOwedCents: 300 });
    expect(some.lines.at(-1)).toMatchObject({ kind: "DEDUCTION", ruleId: "advance", cents: 300 });
    expect([some.earningsCents, some.deductionCents, some.netCents]).toEqual([680, 300, 380]);
    const capped = payDispatcher({ ...base, profile, assignments: card, advanceOwedCents: 5000 });
    expect([capped.deductionCents, capped.netCents]).toEqual([680, 0]);
    const none = payDispatcher({ ...base, profile, assignments: [...card, at("a3", "DEDUCTION", "loan", { dispatcherId: "d1" })], advanceOwedCents: 300 });
    expect(none.lines.some((l) => l.ruleId === "advance")).toBe(false);
  });

  it("pays a full-timer the card for their vehicle, KPI past the tier, less their deduction", () => {
    const pay = payDispatcher({ ...base, profile: { vehicle: "CAR", employment: "FULL_TIME", effectiveFrom: 202610 }, assignments: everyone });
    expect(pay.warnings).toEqual([]);
    expect(pay.lines.map((l) => [l.kind, l.cents])).toEqual([
      ["PARCEL", 680], // 2 × 1.20 + 2 × 2.20
      ["KPI", 100], // parcels 3 and 4 at 0.50
      ["DEDUCTION", 5000],
    ]);
    expect([pay.earningsCents, pay.deductionCents, pay.netCents]).toEqual([780, 5000, -4220]);
  });

  it("leaves KPI out for a part-timer", () => {
    const pay = payDispatcher({ ...base, profile: { vehicle: "BIKE", employment: "PART_TIME", effectiveFrom: 202610 }, assignments: everyone });
    expect(pay.lines.map((l) => [l.kind, l.cents])).toEqual([
      ["PARCEL", 600],
      ["DEDUCTION", 5000],
    ]);
  });

  it("pays nothing without a vehicle and type, and says why", () => {
    expect(payDispatcher({ ...base, profile: null, assignments: everyone })).toEqual({ lines: [], warnings: [{ code: "noProfile" }], earningsCents: 0, deductionCents: 0, netCents: 0 });
  });

  it("flags a rule with no rates yet and a missing rate card, and still pays the rest", () => {
    const pay = payDispatcher({
      ...base,
      profile: { vehicle: "BIKE", employment: "FULL_TIME", effectiveFrom: 202610 },
      assignments: [at("a1", "PARCEL", "late"), at("a2", "KPI", "kpi")],
    });
    expect(pay.warnings).toEqual([{ code: "noRates", kind: "PARCEL", rule: "late" }]);
    expect(pay.lines.map((l) => l.kind)).toEqual(["KPI"]);
    expect(payDispatcher({ ...base, profile: { vehicle: "BIKE", employment: "FULL_TIME", effectiveFrom: 202610 }, assignments: [] }).warnings).toEqual([{ code: "noParcelRule" }]);
  });

  describe("penalties", () => {
    const profile = { vehicle: "BIKE" as const, employment: "PART_TIME" as const, effectiveFrom: 202610 };
    // RM 10 for the first two fake attempts in a month, RM 20 for each one after.
    const fake: RuleConfig = { ...blankConfig({ unit: "penalty:FAKE_ATTEMPT", tiers: [2, null] }), basis: "marginal", values: [[[10]], [[20]]] };
    const lost: RuleConfig = { ...blankConfig({ unit: "penalty:LOST" }), values: [[[0]]] };
    const withPenaltyRules = (ruleId: string) => [...versions, { id: "v-fake", ruleId: "fake", effectiveFrom: 202601, config: fake }, { id: "v-lost", ruleId: "lost", effectiveFrom: 202601, config: lost }].filter((v) => v.ruleId === ruleId);

    it("deducts the file's amounts when no rule covers a type, and flags cases without one", () => {
      const pay = payDispatcher({
        ...base,
        profile,
        assignments: [at("a1", "PARCEL", "card")],
        penalties: [
          { type: "LOST", amountCents: 5000 },
          { type: "FAKE_ATTEMPT", amountCents: 1000 },
          { type: "LOST", amountCents: null },
        ],
      });
      expect(pay.lines.map((l) => [l.ruleId, l.units, l.cents])).toEqual([
        ["card", 4, 600],
        ["file:FAKE_ATTEMPT", 1, 1000],
        ["file:LOST", 2, 5000],
      ]);
      expect(pay.warnings).toEqual([{ code: "noPenaltyAmount", type: "LOST", count: 1 }]);
      expect([pay.earningsCents, pay.deductionCents, pay.netCents]).toEqual([600, 6000, -5400]);
    });

    it("runs a type's rule over its cases in order, so repeat cases escalate; parcels are unaffected", () => {
      const pay = payDispatcher({
        ...base,
        profile,
        versionsOf: withPenaltyRules,
        assignments: [at("a1", "PARCEL", "card"), at("a2", "KPI", "kpi"), at("a3", "PENALTY", "fake"), at("a4", "PENALTY", "lost")],
        penalties: [
          { type: "FAKE_ATTEMPT", amountCents: 500 },
          { type: "FAKE_ATTEMPT", amountCents: 500 },
          { type: "COD_LATE", amountCents: 300 },
          { type: "FAKE_ATTEMPT", amountCents: null },
        ],
      });
      expect(pay.warnings).toEqual([]);
      expect(pay.lines.map((l) => [l.ruleId, l.units, l.cents])).toEqual([
        ["card", 4, 600],
        ["kpi", 4, 100], // still 4 parcels: penalties don't count towards parcel tiers
        ["fake", 3, 4000], // 10 + 10 + 20; the file's amounts are ignored
        ["file:COD_LATE", 1, 300],
      ]);
      expect(pay.lines.find((l) => l.ruleId === "fake")?.groups.map((g) => [g.tier, g.units])).toEqual([
        [0, 2],
        [1, 1],
      ]);
    });

    it("lets a dispatcher's own penalty rule win for its type only", () => {
      const own: RuleConfig = { ...fake, values: [[[1]], [[1]]] };
      const pay = payDispatcher({
        ...base,
        profile,
        versionsOf: (ruleId) => (ruleId === "own" ? [{ id: "v-own", ruleId, effectiveFrom: 202601, config: own }] : withPenaltyRules(ruleId)),
        assignments: [at("a1", "PARCEL", "card"), at("a2", "PENALTY", "fake"), at("a3", "PENALTY", "own", { dispatcherId: "d1" }), at("a4", "PENALTY", "lost")],
        penalties: [
          { type: "FAKE_ATTEMPT", amountCents: 500 },
          { type: "LOST", amountCents: 9900 },
        ],
      });
      expect(pay.lines.map((l) => [l.ruleId, l.cents])).toEqual([
        ["card", 600],
        ["own", 100],
        ["lost", 0], // a rule of RM 0 waives the file's amount
      ]);
    });
  });

  it("uses this dispatcher's own rule over everyone's", () => {
    const pay = payDispatcher({
      ...base,
      profile: { vehicle: "BIKE", employment: "PART_TIME", effectiveFrom: 202610 },
      assignments: [at("a1", "PARCEL", "card"), at("a9", "PARCEL", "kpi", { dispatcherId: "d1" })],
    });
    expect(pay.lines.map((l) => [l.ruleId, l.cents])).toEqual([["kpi", 100]]);
  });
});
