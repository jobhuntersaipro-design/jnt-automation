import { describe, expect, it } from "vitest";
import { isOverdue, planPricing } from "@/lib/billing";

const agent = { createdAt: "2026-04-01T00:00:00Z", isSuperAdmin: false, onlinePayment: true };

describe("isOverdue", () => {
  it("is not overdue on the invoice day, overdue a day after", () => {
    expect(isOverdue(agent, [], new Date("2026-11-01T12:00:00Z"))).toBe(false);
    expect(isOverdue(agent, [], new Date("2026-11-02T00:00:00Z"))).toBe(true);
  });
  it("ignores October and paid months", () => {
    expect(isOverdue(agent, [], new Date("2026-10-31T00:00:00Z"))).toBe(false);
    expect(isOverdue(agent, [{ year: 2026, month: 11, paidAt: "2026-11-01" }], new Date("2026-11-20T00:00:00Z"))).toBe(false);
  });
  it("never blocks superadmins or accounts without online payment", () => {
    const later = new Date("2026-12-05T00:00:00Z");
    expect(isOverdue({ ...agent, isSuperAdmin: true }, [], later)).toBe(false);
    expect(isOverdue({ ...agent, onlinePayment: false }, [], later)).toBe(false);
  });
});

describe("planPricing", () => {
  it("uses the fixed monthly price when set", () => {
    expect(planPricing({ maxBranches: 20, monthlyPrice: 2500 })).toEqual({ branchCount: 1, unitPrice: 2500, amount: 2500 });
    expect(planPricing({ maxBranches: 20, monthlyPrice: null }).amount).toBe(3000);
  });
});
