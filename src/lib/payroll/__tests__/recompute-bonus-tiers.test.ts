import { describe, it, expect } from "vitest";
import {
  recomputeRecordForBonusTiers,
  type RecomputeLineItem,
  type TierConfig,
} from "../recompute-bonus-tiers";

const weightTiers: TierConfig[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];

const bonusTiers: TierConfig[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.5 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 2.1 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 3.3 },
];

function makeItems(count: number, weight = 3.0, baseDate = new Date("2026-03-01")): RecomputeLineItem[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    return {
      id: `li-${String(i + 1).padStart(4, "0")}`,
      waybillNumber: `WB${String(i + 1).padStart(5, "0")}`,
      weight,
      deliveryDate: d,
      commission: 0,
      isBonusTier: false,
    };
  });
}

describe("recomputeRecordForBonusTiers", () => {
  it("below threshold → bonusTierEarnings=0, no items flagged", () => {
    const items = makeItems(5, 3.0);
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 10,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    expect(result.baseSalary).toBe(5);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.netSalary).toBe(5);
    expect(result.lineItemUpdates.filter((u) => u.isBonusTier)).toHaveLength(0);
  });

  it("orderThreshold=0 → bonus tier disabled, all parcels priced at base rate", () => {
    const items = makeItems(5, 3.0);
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 0,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    expect(result.baseSalary).toBe(5);
    expect(result.bonusTierEarnings).toBe(0);
    expect(result.lineItemUpdates.filter((u) => u.isBonusTier)).toHaveLength(0);
  });

  it("crosses threshold by 1 → exactly one item flagged, priced at bonusTierEarnings rate", () => {
    const items = makeItems(4, 3.0);
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 3,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    expect(result.baseSalary).toBe(3);
    expect(result.bonusTierEarnings).toBe(1.5);
    const flagged = result.lineItemUpdates.filter((u) => u.isBonusTier);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].commission).toBe(1.5);
  });

  it("preserves penalty + advance in netSalary", () => {
    const items = makeItems(4, 3.0);
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 3,
      petrolSubsidy: 30,
      penalty: 10,
      advance: 5,
    });
    // base=3, bonusTierEarnings=1.5, petrol=30, penalty=10, advance=5 → net=19.5
    expect(result.netSalary).toBe(19.5);
  });

  it("uses stable sort (deliveryDate asc, waybill tiebreaker) so output is deterministic", () => {
    const sameDate = new Date("2026-03-15");
    const items: RecomputeLineItem[] = [
      { id: "a", waybillNumber: "ZZZ", weight: 3, deliveryDate: sameDate, commission: 0, isBonusTier: false },
      { id: "b", waybillNumber: "AAA", weight: 3, deliveryDate: sameDate, commission: 0, isBonusTier: false },
      { id: "c", waybillNumber: "MMM", weight: 3, deliveryDate: sameDate, commission: 0, isBonusTier: false },
    ];
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 1,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    // After stable sort: AAA (base), MMM (bonusTierEarnings), ZZZ (bonusTierEarnings)
    const byId = new Map(result.lineItemUpdates.map((u) => [u.id, u]));
    expect(byId.get("b")!.isBonusTier).toBe(false); // AAA
    expect(byId.get("c")!.isBonusTier).toBe(true); // MMM
    expect(byId.get("a")!.isBonusTier).toBe(true); // ZZZ
  });

  it("null delivery dates sort last — they can't occupy the first threshold slots", () => {
    const items: RecomputeLineItem[] = [
      { id: "null", waybillNumber: "N", weight: 3, deliveryDate: null, commission: 0, isBonusTier: false },
      { id: "mar", waybillNumber: "M", weight: 3, deliveryDate: new Date("2026-03-01"), commission: 0, isBonusTier: false },
      { id: "apr", waybillNumber: "A", weight: 3, deliveryDate: new Date("2026-04-01"), commission: 0, isBonusTier: false },
    ];
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 2,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    const byId = new Map(result.lineItemUpdates.map((u) => [u.id, u]));
    expect(byId.get("mar")!.isBonusTier).toBe(false);
    expect(byId.get("apr")!.isBonusTier).toBe(false);
    expect(byId.get("null")!.isBonusTier).toBe(true);
  });

  it("only emits line-item updates whose commission or isBonusTier changed (idempotent)", () => {
    // Seed items already at expected state — a second recompute is a no-op on line items.
    const items: RecomputeLineItem[] = [
      { id: "a", waybillNumber: "A", weight: 3, deliveryDate: new Date("2026-03-01"), commission: 1.0, isBonusTier: false },
      { id: "b", waybillNumber: "B", weight: 3, deliveryDate: new Date("2026-03-02"), commission: 1.5, isBonusTier: true },
    ];
    const result = recomputeRecordForBonusTiers({
      lineItems: items,
      weightTiers,
      bonusTiers,
      orderThreshold: 1,
      petrolSubsidy: 0,
      penalty: 0,
      advance: 0,
    });
    expect(result.changedLineItemUpdates).toHaveLength(0);
  });
});
