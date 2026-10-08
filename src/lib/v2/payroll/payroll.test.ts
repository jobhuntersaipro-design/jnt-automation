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

  it("uses this dispatcher's own rule over everyone's", () => {
    const pay = payDispatcher({
      ...base,
      profile: { vehicle: "BIKE", employment: "PART_TIME", effectiveFrom: 202610 },
      assignments: [at("a1", "PARCEL", "card"), at("a9", "PARCEL", "kpi", { dispatcherId: "d1" })],
    });
    expect(pay.lines.map((l) => [l.ruleId, l.cents])).toEqual([["kpi", 100]]);
  });
});
