import { describe, expect, it } from "vitest";
import { planCover, type CoverRule } from "./cover";

const JAN = 202601;
const everyone = (id: string, effectiveFrom: number) => ({ id, branchId: null, dispatcherId: null, employment: null, effectiveFrom });

describe("planCover", () => {
  it("is null without a rate card", () => {
    expect(planCover(JAN, [])).toBeNull();
  });

  it("moves the earliest rates and each who's earliest assignment back to the month", () => {
    const rule: CoverRule = {
      id: "r1",
      versions: [{ id: "v-dec", effectiveFrom: 202612 }, { id: "v-oct", effectiveFrom: 202610 }],
      assignments: [everyone("a-oct", 202610), everyone("a-nov", 202611), { ...everyone("a-out", 202610), branchId: "b1" }],
    };
    expect(planCover(JAN, [rule])).toEqual({ versions: ["v-oct"], assignments: ["a-oct", "a-out"], assignEveryone: null });
  });

  it("leaves what already covers the month alone", () => {
    const rule: CoverRule = { id: "r1", versions: [{ id: "v", effectiveFrom: 202512 }], assignments: [everyone("a", 202601)] };
    expect(planCover(JAN, [rule])).toEqual({ versions: [], assignments: [], assignEveryone: null });
  });

  it("gives the newest card to everyone when it applies to nobody", () => {
    const rules: CoverRule[] = [
      { id: "new", versions: [{ id: "v1", effectiveFrom: 202610 }], assignments: [] },
      { id: "old", versions: [{ id: "v2", effectiveFrom: 202601 }], assignments: [] },
    ];
    expect(planCover(JAN, rules)).toEqual({ versions: ["v1"], assignments: [], assignEveryone: "new" });
  });
});
