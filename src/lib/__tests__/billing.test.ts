import { describe, it, expect } from "vitest";
import {
  billableMonths,
  billingStatus,
  firstBillableMonth,
  invoiceAmount,
  invoiceNumber,
  isInTrial,
  normalizePhone,
  trialEndDate,
  whatsappLink,
} from "@/lib/billing";

const signup = "2026-10-06T04:00:00.000Z";

describe("trial", () => {
  it("ends 30 days after signup", () => {
    expect(trialEndDate(signup).toISOString()).toBe("2026-11-05T04:00:00.000Z");
  });

  it("is active until the end date", () => {
    expect(isInTrial(signup, new Date("2026-11-05T03:59:59Z"))).toBe(true);
    expect(isInTrial(signup, new Date("2026-11-05T04:00:00Z"))).toBe(false);
  });

  it("first billable month is the month the trial ends in", () => {
    expect(firstBillableMonth(signup)).toEqual({ year: 2026, month: 11 });
    expect(firstBillableMonth("2026-12-15T00:00:00Z")).toEqual({ year: 2027, month: 1 });
  });

  it("never starts before billing tracking began (Oct 2026)", () => {
    expect(firstBillableMonth("2026-03-01T00:00:00Z")).toEqual({ year: 2026, month: 10 });
    expect(billableMonths("2026-03-01T00:00:00Z", new Date("2026-11-02T00:00:00Z"))).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 10 },
    ]);
  });
});

describe("billableMonths", () => {
  it("is empty while the trial month hasn't started", () => {
    expect(billableMonths(signup, new Date("2026-10-31T00:00:00Z"))).toEqual([]);
  });

  it("lists months newest first, across a year boundary", () => {
    expect(billableMonths(signup, new Date("2027-01-10T00:00:00Z"))).toEqual([
      { year: 2027, month: 1 },
      { year: 2026, month: 12 },
      { year: 2026, month: 11 },
    ]);
  });
});

describe("billingStatus", () => {
  const agent = { createdAt: signup, isSuperAdmin: false };

  it("is trial before the first billable month", () => {
    expect(billingStatus(agent, [], { year: 2026, month: 10 })).toBe("trial");
  });

  it("is unpaid without a paid invoice", () => {
    expect(billingStatus(agent, [], { year: 2026, month: 11 })).toBe("unpaid");
    expect(
      billingStatus(agent, [{ year: 2026, month: 11, paidAt: null }], { year: 2026, month: 11 }),
    ).toBe("unpaid");
  });

  it("is paid when that month's invoice has paidAt", () => {
    const inv = [{ year: 2026, month: 11, paidAt: "2026-11-20T00:00:00Z" }];
    expect(billingStatus(agent, inv, { year: 2026, month: 11 })).toBe("paid");
    expect(billingStatus(agent, inv, { year: 2026, month: 12 })).toBe("unpaid");
  });

  it("doesn't bill months before tracking started for older accounts", () => {
    const old = { createdAt: "2026-03-15T00:00:00Z", isSuperAdmin: false }; // trial ends 14 Apr
    expect(billingStatus(old, [], { year: 2026, month: 3 })).toBe("trial");
    expect(billingStatus(old, [], { year: 2026, month: 8 })).toBe("exempt");
    expect(billingStatus(old, [], { year: 2026, month: 10 })).toBe("unpaid");
  });

  it("exempts superadmins", () => {
    expect(billingStatus({ ...agent, isSuperAdmin: true }, [], { year: 2026, month: 12 })).toBe("exempt");
  });
});

describe("invoice helpers", () => {
  it("prices RM150 per branch", () => {
    expect(invoiceAmount(3)).toBe(450);
    expect(invoiceAmount(0)).toBe(0);
  });

  it("builds a stable invoice number", () => {
    expect(invoiceNumber("cmabc123xyz789", { year: 2026, month: 3 })).toBe("INV-202603-XYZ789");
  });
});

describe("phone", () => {
  it("normalizes and validates", () => {
    expect(normalizePhone(" 012-345 6789 ")).toBe("0123456789");
    expect(normalizePhone("+60 12-345 6789")).toBe("+60123456789");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("links local numbers with the Malaysian country code", () => {
    expect(whatsappLink("0123456789")).toBe("https://wa.me/60123456789");
    expect(whatsappLink("+60123456789")).toBe("https://wa.me/60123456789");
  });
});
