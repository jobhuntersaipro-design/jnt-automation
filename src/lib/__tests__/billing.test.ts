import { describe, it, expect } from "vitest";
import {
  billableMonths,
  billingStatus,
  firstBillableMonth,
  invoiceAction,
  invoiceAmount,
  invoiceNumber,
  isInTrial,
  normalizePhone,
  planLimitError,
  trialDaysLeft,
  trialEndDate,
  whatsappLink,
} from "@/lib/billing";

const signup = "2026-10-06T04:00:00.000Z";

describe("trial", () => {
  it("ends 30 days after signup", () => {
    expect(trialEndDate(signup).toISOString()).toBe("2026-11-05T04:00:00.000Z");
  });

  it("counts whole days left, rounding up", () => {
    expect(trialDaysLeft(signup, new Date("2026-10-06T04:00:00Z"))).toBe(30);
    expect(trialDaysLeft(signup, new Date("2026-11-04T05:00:00Z"))).toBe(1);
    expect(trialDaysLeft(signup, new Date("2026-11-05T04:00:00Z"))).toBe(0);
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

describe("planLimitError", () => {
  it("accepts limits between branches in use and the self-serve cap", () => {
    expect(planLimitError(3, 2)).toBeNull();
    expect(planLimitError(2, 2)).toBeNull();
    expect(planLimitError(50, 0)).toBeNull();
  });

  it("rejects going below branches in use, zero, fractions and above the cap", () => {
    expect(planLimitError(1, 2)).toContain("can't go below 2");
    expect(planLimitError(0, 0)).toContain("at least 1");
    expect(planLimitError(1.5, 0)).toContain("at least 1");
    expect(planLimitError(51, 0)).toContain("contact");
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

describe("invoiceAction (daily billing job)", () => {
  const agent = { createdAt: "2026-09-01T00:00:00.000Z", isSuperAdmin: false }; // trial ends 1 Oct
  const oct = (day: number) => new Date(Date.UTC(2026, 9, day, 1));
  const inv = (sentAt: string | null, extra: Partial<{ paidAt: string; remindedAt: string }> = {}) => ({
    year: 2026, month: 10, sentAt, paidAt: null, remindedAt: null, ...extra,
  });

  it("does nothing during the trial or for admins", () => {
    expect(invoiceAction({ ...agent, createdAt: "2026-10-01T00:00:00.000Z" }, null, oct(10))).toBeNull();
    expect(invoiceAction({ ...agent, isSuperAdmin: true }, null, oct(10))).toBeNull();
  });
  it("sends once the trial is over and nothing was sent", () => {
    expect(invoiceAction(agent, null, oct(2))).toBe("send");
  });
  it("reminds once, on or after the due date", () => {
    const sent = "2026-10-02T01:00:00.000Z";
    expect(invoiceAction(agent, inv(sent), oct(8))).toBeNull();
    expect(invoiceAction(agent, inv(sent), oct(9))).toBe("remind");
    expect(invoiceAction(agent, inv(sent, { remindedAt: "2026-10-09T01:00:00.000Z" }), oct(12))).toBeNull();
  });
  it("skips paid months", () => {
    expect(invoiceAction(agent, inv(null, { paidAt: "2026-10-02T00:00:00.000Z" }), oct(3))).toBeNull();
  });
});
