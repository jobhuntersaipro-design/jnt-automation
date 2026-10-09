import { describe, expect, it } from "vitest";
import type { PayLine } from "./calc";
import { branchStats } from "./branch-stats";

const l = (kind: PayLine["kind"], cents: number, ruleId = "r"): PayLine => ({ kind, ruleId, versionId: "v", name: kind, units: 1, groups: [], cents });

describe("branchStats", () => {
  it("splits pay by part, counts deductions and compares with last month", () => {
    const run = {
      branch: "PHG415",
      runId: "a",
      status: "FINAL",
      parcels: 300,
      results: [
        { name: "A", netCents: 900, cases: 2, lines: [l("PARCEL", 1000), l("KPI", 100), l("SUCCESS", 100), l("PENALTY", 200), l("DEDUCTION", 100, "advance")] },
        { name: "B", netCents: -50, cases: 1, lines: [l("PARCEL", 50), l("ALLOWANCE", 20), l("PENALTY", 120)] },
      ],
    };
    const [s] = branchStats([run], [{ ...run, results: [{ name: "A", netCents: 700, cases: 0, lines: [] }] }]);
    expect(s).toMatchObject({ riders: 2, paid: 1, belowZero: 1, netCents: 850, rateCents: 1050, kpiCents: 100, bonusCents: 100, otherCents: 20, penaltyCents: 320, penaltyCases: 3, advanceCents: 100, prevNetCents: 700, top: { name: "A", netCents: 900 } });
  });
});
