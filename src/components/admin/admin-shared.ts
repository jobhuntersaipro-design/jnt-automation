import {
  PRICE_PER_BRANCH,
  billingStatus,
  trialEndDate,
  type BillingStatus,
  type YearMonth,
} from "@/lib/billing";
import type { AdminAgent } from "@/lib/db/admin";

export type AdminInvoice = AdminAgent["invoices"][number];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatRM(amount: number) {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function formatMonth({ year, month }: YearMonth) {
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

export function findInvoice(agent: AdminAgent, ym: YearMonth): AdminInvoice | undefined {
  return agent.invoices.find((i) => i.year === ym.year && i.month === ym.month);
}

export interface MonthBill {
  status: BillingStatus;
  amount: number;
  invoice?: AdminInvoice;
}

/** What the agent owes (or paid) for a month. Paid months keep their paid amount. */
export function monthBill(agent: AdminAgent, ym: YearMonth): MonthBill {
  const invoice = findInvoice(agent, ym);
  const status = billingStatus(agent, agent.invoices, ym);
  const amount = invoice?.paidAt ? invoice.amount : agent.maxBranches * PRICE_PER_BRANCH;
  return { status, amount, invoice };
}

export function trialInfo(createdAt: string, now = new Date()) {
  const end = trialEndDate(createdAt);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  return { end, daysLeft, active: daysLeft > 0 };
}

export const BILLING_CHIP: Record<BillingStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  unpaid: { label: "Unpaid", className: "bg-red-50 text-critical" },
  trial: { label: "Trial", className: "bg-brand/10 text-brand" },
  exempt: { label: "—", className: "text-on-surface-variant/50" },
};
