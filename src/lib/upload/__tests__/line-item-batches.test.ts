import { describe, it, expect } from "vitest";
import { priceLineItems, type BonusTierInput, type WeightTierInput } from "../calculator";
import type { ParsedRow } from "../parser";
import { groupRowsByExtId, lineItemBatches, type LineItemSource } from "../line-item-batches";

const weightTiers: WeightTierInput[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];
const bonusTiers: BonusTierInput[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

function makeRows(extId: string, count: number): ParsedRow[] {
  // Reverse date order so pricing has to sort them.
  return Array.from({ length: count }, (_, i) => ({
    waybillNumber: `${extId}-WB${String(i).padStart(4, "0")}`,
    branchName: "PHG379",
    deliveryDate: new Date(Date.UTC(2026, 8, 30 - (i % 30))),
    dispatcherId: extId,
    dispatcherName: extId,
    billingWeight: (i * 3.7) % 15,
  }));
}

function source(id: string, count: number, orderThreshold: number): LineItemSource {
  return { salaryRecordId: `rec-${id}`, rows: makeRows(id, count), weightTiers, bonusTiers, orderThreshold };
}

/** The old confirm flow: price everything, flatten in order, slice. */
function eagerBatches(sources: LineItemSource[], size: number) {
  const all = sources.flatMap((s) =>
    priceLineItems(s.rows, s.weightTiers, s.bonusTiers, s.orderThreshold).map((li) => ({
      salaryRecordId: s.salaryRecordId,
      ...li,
    })),
  );
  const out = [];
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

describe("lineItemBatches", () => {
  it("yields the same batches as pricing everything up front and slicing", () => {
    const sources = [source("A", 23, 10), source("B", 0, 5), source("C", 7, 0), source("D", 31, 30)];
    for (const size of [1, 4, 10, 61, 100]) {
      expect([...lineItemBatches(sources, size)]).toEqual(eagerBatches(sources, size));
    }
  });

  it("splits bonus-tier pricing at the order threshold within a dispatcher", () => {
    const [batch] = [...lineItemBatches([source("A", 5, 3)], 10)];
    expect(batch.map((li) => li.isBonusTier)).toEqual([false, false, false, true, true]);
  });

  it("yields nothing when there are no line items", () => {
    expect([...lineItemBatches([source("A", 0, 5)], 10)]).toEqual([]);
    expect([...lineItemBatches([], 10)]).toEqual([]);
  });

  it("prices a dispatcher only when its first batch is pulled", () => {
    let pulled = 0;
    function* counted() {
      for (const s of [source("A", 4, 0), source("B", 4, 0), source("C", 4, 0)]) {
        pulled++;
        yield s;
      }
    }
    const it = lineItemBatches(counted(), 4);
    it.next();
    expect(pulled).toBe(1);
    it.next();
    expect(pulled).toBe(2);
  });
});

describe("groupRowsByExtId", () => {
  it("groups the wanted extIds in row order and drops the rest", () => {
    const rows = [...makeRows("A", 3), ...makeRows("X", 2), ...makeRows("B", 2)];
    const groups = groupRowsByExtId(rows, ["A", "B", "C"]);
    expect([...groups.keys()]).toEqual(["A", "B", "C"]);
    expect(groups.get("A")).toEqual(rows.slice(0, 3));
    expect(groups.get("B")).toEqual(rows.slice(5));
    expect(groups.get("C")).toEqual([]);
    expect(groups.has("X")).toBe(false);
  });
});
