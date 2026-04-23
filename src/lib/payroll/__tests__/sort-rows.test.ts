import { describe, it, expect } from "vitest";
import { sortAndPinRows, type SortableRow, type SortKey } from "../sort-rows";

function row(partial: Partial<SortableRow> & { dispatcherId: string }): SortableRow {
  return {
    dispatcherId: partial.dispatcherId,
    name: partial.name ?? "Z",
    totalOrders: partial.totalOrders ?? 0,
    baseSalary: partial.baseSalary ?? 0,
    bonusTierEarnings: partial.bonusTierEarnings ?? 0,
    petrolSubsidy: partial.petrolSubsidy ?? 0,
    penalty: partial.penalty ?? 0,
    advance: partial.advance ?? 0,
    commission: partial.commission ?? 0,
    netSalary: partial.netSalary ?? 0,
    isPinned: partial.isPinned ?? false,
  };
}

describe("sortAndPinRows", () => {
  it("returns rows unchanged when no sort is active and nothing is pinned", () => {
    const rows = [row({ dispatcherId: "a", name: "Alpha" }), row({ dispatcherId: "b", name: "Bravo" })];
    const out = sortAndPinRows(rows, null, "asc");
    expect(out.map((r) => r.dispatcherId)).toEqual(["a", "b"]);
  });

  it("floats pinned rows to the top preserving original order among them", () => {
    const rows = [
      row({ dispatcherId: "a", name: "Alpha" }),
      row({ dispatcherId: "b", name: "Bravo", isPinned: true }),
      row({ dispatcherId: "c", name: "Charlie" }),
      row({ dispatcherId: "d", name: "Delta", isPinned: true }),
    ];
    const out = sortAndPinRows(rows, null, "asc");
    expect(out.map((r) => r.dispatcherId)).toEqual(["b", "d", "a", "c"]);
  });

  it("sorts by netSalary desc", () => {
    const rows = [
      row({ dispatcherId: "a", netSalary: 100 }),
      row({ dispatcherId: "b", netSalary: 500 }),
      row({ dispatcherId: "c", netSalary: 300 }),
    ];
    const out = sortAndPinRows(rows, "netSalary", "desc");
    expect(out.map((r) => r.dispatcherId)).toEqual(["b", "c", "a"]);
  });

  it("sorts by name asc (case-insensitive)", () => {
    const rows = [
      row({ dispatcherId: "a", name: "charlie" }),
      row({ dispatcherId: "b", name: "Bravo" }),
      row({ dispatcherId: "c", name: "alpha" }),
    ];
    const out = sortAndPinRows(rows, "name", "asc");
    expect(out.map((r) => r.dispatcherId)).toEqual(["c", "b", "a"]);
  });

  it("applies the same sort within the pinned group and within the unpinned group", () => {
    const rows = [
      row({ dispatcherId: "a", netSalary: 100 }),
      row({ dispatcherId: "b", netSalary: 500, isPinned: true }),
      row({ dispatcherId: "c", netSalary: 300 }),
      row({ dispatcherId: "d", netSalary: 700, isPinned: true }),
      row({ dispatcherId: "e", netSalary: 200 }),
    ];
    const out = sortAndPinRows(rows, "netSalary", "desc");
    // pinned (sorted desc) then unpinned (sorted desc)
    expect(out.map((r) => r.dispatcherId)).toEqual(["d", "b", "c", "e", "a"]);
  });

  it("supports every numeric sort key", () => {
    const keys: SortKey[] = [
      "totalOrders",
      "baseSalary",
      "bonusTierEarnings",
      "petrolSubsidy",
      "penalty",
      "advance",
      "commission",
      "netSalary",
    ];
    for (const key of keys) {
      const rows = [
        row({ dispatcherId: "lo", [key]: 1 } as Partial<SortableRow> & { dispatcherId: string }),
        row({ dispatcherId: "hi", [key]: 99 } as Partial<SortableRow> & { dispatcherId: string }),
      ];
      const asc = sortAndPinRows(rows, key, "asc").map((r) => r.dispatcherId);
      const desc = sortAndPinRows(rows, key, "desc").map((r) => r.dispatcherId);
      expect(asc).toEqual(["lo", "hi"]);
      expect(desc).toEqual(["hi", "lo"]);
    }
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ dispatcherId: "a", netSalary: 100 }),
      row({ dispatcherId: "b", netSalary: 500 }),
    ];
    const before = rows.map((r) => r.dispatcherId);
    sortAndPinRows(rows, "netSalary", "desc");
    expect(rows.map((r) => r.dispatcherId)).toEqual(before);
  });

  it("uses dispatcherId as a stable tiebreaker when values are equal", () => {
    const rows = [
      row({ dispatcherId: "b", netSalary: 100 }),
      row({ dispatcherId: "a", netSalary: 100 }),
      row({ dispatcherId: "c", netSalary: 100 }),
    ];
    const out = sortAndPinRows(rows, "netSalary", "desc");
    expect(out.map((r) => r.dispatcherId)).toEqual(["a", "b", "c"]);
  });
});
