import { describe, expect, it } from "vitest";
import { planMerge, profilesToMove, type MergeResult } from "./merge";

const r = (id: string, runId: string, final = false, w = [1]): MergeResult => ({
  id,
  runId,
  final,
  label: runId,
  parcels: { w, c: "n".repeat(w.length) },
});

describe("planMerge", () => {
  it("moves results from runs only the merged record is in", () => {
    expect(planMerge([r("k1", "A")], [r("d1", "B")])).toEqual({
      move: ["d1"],
      combine: [],
      blocked: [],
    });
  });

  it("joins parcels when both are in one draft run", () => {
    const plan = planMerge(
      [r("k1", "A", false, [1, 2])],
      [r("d1", "A", false, [3])],
    );
    expect(plan.combine).toEqual([
      {
        keepId: "k1",
        dropId: "d1",
        runId: "A",
        parcels: { w: [1, 2, 3], c: "nnn" },
      },
    ]);
    expect(plan.move).toEqual([]);
  });

  it("refuses when both were paid in a finalised run", () => {
    expect(
      planMerge([r("k1", "A", true)], [r("d1", "A", true), r("d2", "B", true)]),
    ).toEqual({ move: ["d2"], combine: [], blocked: ["A"] });
  });
});

describe("profilesToMove", () => {
  it("keeps the kept record's months and fills the others", () => {
    const keep = [{ id: "k", effectiveFrom: 202610 }];
    const drop = [
      { id: "a", effectiveFrom: 202609 },
      { id: "b", effectiveFrom: 202610 },
    ];
    expect(profilesToMove(keep, drop)).toEqual(["a"]);
  });
});
