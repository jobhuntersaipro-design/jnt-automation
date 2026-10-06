/**
 * Subscription billing rules: 30-day free trial from signup, then one invoice
 * per calendar month (starting with the month the trial ends) priced at
 * branch limit × PRICE_PER_BRANCH.
 */

export const TRIAL_DAYS = 30;
export const PRICE_PER_BRANCH = 150;
export const INVOICE_DUE_DAYS = 7;
/** Highest branch limit an agent can set themselves; admins can go higher. */
export const SELF_SERVE_MAX_BRANCHES = 50;
/** Billing was first tracked in the app this month; earlier months were settled outside it. */
export const BILLING_TRACKING_START: YearMonth = { year: 2026, month: 10 };

export interface YearMonth {
  year: number;
  month: number; // 1–12
}

export type BillingStatus = "trial" | "paid" | "unpaid" | "exempt";

export interface InvoiceLike extends YearMonth {
  paidAt: string | Date | null;
}

export function trialEndDate(createdAt: Date | string): Date {
  const d = new Date(createdAt);
  d.setUTCDate(d.getUTCDate() + TRIAL_DAYS);
  return d;
}

export function isInTrial(createdAt: Date | string, now: Date = new Date()): boolean {
  return now < trialEndDate(createdAt);
}

/**
 * First month that gets an invoice: the calendar month the trial ends in, but
 * never before BILLING_TRACKING_START.
 */
export function firstBillableMonth(createdAt: Date | string): YearMonth {
  const trialMonth = trialEndMonth(createdAt);
  return monthKey(trialMonth) < monthKey(BILLING_TRACKING_START) ? BILLING_TRACKING_START : trialMonth;
}

function trialEndMonth(createdAt: Date | string): YearMonth {
  const end = trialEndDate(createdAt);
  return { year: end.getUTCFullYear(), month: end.getUTCMonth() + 1 };
}

export function monthKey({ year, month }: YearMonth): number {
  return year * 12 + (month - 1);
}

/** Billable months from the first billable month up to `now`, newest first. */
export function billableMonths(createdAt: Date | string, now: Date = new Date()): YearMonth[] {
  const first = monthKey(firstBillableMonth(createdAt));
  const last = monthKey({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });
  const months: YearMonth[] = [];
  for (let k = last; k >= first; k--) {
    months.push({ year: Math.floor(k / 12), month: (k % 12) + 1 });
  }
  return months;
}

export function billingStatus(
  agent: { createdAt: Date | string; isSuperAdmin: boolean },
  invoices: InvoiceLike[],
  ym: YearMonth,
): BillingStatus {
  if (agent.isSuperAdmin) return "exempt";
  if (monthKey(ym) < monthKey(trialEndMonth(agent.createdAt))) return "trial";
  // Months after the trial but before billing was tracked in the app.
  if (monthKey(ym) < monthKey(BILLING_TRACKING_START)) return "exempt";
  const inv = invoices.find((i) => i.year === ym.year && i.month === ym.month);
  return inv?.paidAt ? "paid" : "unpaid";
}

/** Why an agent can't set this branch limit, or null if they can. */
export function planLimitError(requested: number, branchesInUse: number): string | null {
  if (!Number.isInteger(requested) || requested < 1) return "Branch limit must be at least 1.";
  if (requested < branchesInUse) {
    return `You're using ${branchesInUse} branch${branchesInUse === 1 ? "" : "es"}, so the limit can't go below ${branchesInUse}.`;
  }
  if (requested > SELF_SERVE_MAX_BRANCHES) {
    return `For more than ${SELF_SERVE_MAX_BRANCHES} branches, contact onboarding@kim-brothers.com.`;
  }
  return null;
}

export function invoiceAmount(branchCount: number): number {
  return Math.max(0, branchCount) * PRICE_PER_BRANCH;
}

export function invoiceNumber(agentId: string, { year, month }: YearMonth): string {
  return `INV-${year}${String(month).padStart(2, "0")}-${agentId.slice(-6).toUpperCase()}`;
}

export function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && Number.isInteger(month) && year >= 2020 && year <= 2100 && month >= 1 && month <= 12;
}

/** Keeps digits and a leading +; returns null unless 8–15 digits remain. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

/** wa.me link; local Malaysian numbers (leading 0) get the 60 country code. */
export function whatsappLink(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!phone.trim().startsWith("+") && digits.startsWith("0")) digits = "6" + digits;
  return `https://wa.me/${digits}`;
}
