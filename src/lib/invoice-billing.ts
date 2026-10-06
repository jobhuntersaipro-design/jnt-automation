/**
 * Invoice delivery + online payment: email invoices with a Billplz pay link,
 * mark them paid from the Billplz callback, and the daily billing job.
 */

import type { Invoice } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getInvoiceAgent, upsertInvoice } from "@/lib/db/admin";
import { PRICE_PER_BRANCH, invoiceAction, invoiceNumber } from "@/lib/billing";
import { billplzConfigured, createBill, deleteBill } from "@/lib/billplz";
import { renderAgentInvoice, type InvoiceAgent } from "@/lib/invoice-render";
import { sendInvoiceEmail } from "@/lib/email";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Billplz link for an unpaid invoice; reuses the bill unless the amount changed. */
export async function paymentLinkFor(agent: InvoiceAgent, inv: Invoice): Promise<string | null> {
  if (inv.paidAt || !agent.onlinePayment || !billplzConfigured()) return null;
  if (inv.billplzBillId && inv.billplzUrl && inv.billplzAmount === inv.amount) return inv.billplzUrl;
  if (inv.billplzBillId) {
    // Retire the old bill so it can't be paid at the stale amount.
    await deleteBill(inv.billplzBillId).catch((err) => console.error("[billplz] delete old bill failed", err));
  }
  const invoiceNo = invoiceNumber(agent.id, inv);
  const bill = await createBill({
    email: agent.email,
    name: agent.name || agent.email,
    amount: inv.amount,
    description: `EasyStaff ${MONTHS[inv.month - 1]} ${inv.year} · ${inv.branchCount} branch${inv.branchCount === 1 ? "" : "es"} · ${invoiceNo}`,
    reference: invoiceNo,
  });
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { billplzBillId: bill.id, billplzUrl: bill.url, billplzAmount: inv.amount },
  });
  return bill.url;
}

/**
 * Email an invoice (records sentAt), a due-date reminder, or a receipt for a
 * paid month. A Billplz failure still sends the email, just without the link.
 * Throws if the email fails.
 */
export async function sendAgentInvoice(
  agent: InvoiceAgent,
  year: number,
  month: number,
  kind: "invoice" | "reminder" | "receipt" = "invoice",
) {
  // Record the send first so the PDF's issue date matches the email.
  const inv = await upsertInvoice(agent.id, year, month, agent.maxBranches, PRICE_PER_BRANCH,
    kind === "invoice" ? { sentAt: new Date() } : {});
  const payUrl = await paymentLinkFor(agent, inv).catch((err) => {
    console.error("[billplz] create bill failed", err);
    return null;
  });
  const { pdf, filename } = await renderAgentInvoice(agent, year, month);
  await sendInvoiceEmail({
    to: agent.email,
    name: agent.name,
    year,
    month,
    amount: inv.amount,
    branchCount: inv.branchCount,
    invoiceNo: invoiceNumber(agent.id, { year, month }),
    paid: Boolean(inv.paidAt),
    reminder: kind === "reminder",
    payUrl,
    pdf,
    filename,
  });
  if (kind === "reminder") await prisma.invoice.update({ where: { id: inv.id }, data: { remindedAt: new Date() } });
  return inv;
}

/** Mark the invoice behind a paid Billplz bill as paid and email a receipt. Idempotent. */
export async function markBillPaid(billId: string, paidAmountCents: number) {
  const inv = await prisma.invoice.findUnique({ where: { billplzBillId: billId } });
  if (!inv) {
    console.error(`[billplz] paid bill ${billId} matches no invoice — check Billplz and mark it paid in Admin`);
    return;
  }
  if (inv.paidAt) return;
  const amount = paidAmountCents / 100;
  // Record what was actually paid; the limit may have changed since the bill was made.
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { paidAt: new Date(), amount, branchCount: Math.round(amount / inv.unitPrice) },
  });
  const agent = await getInvoiceAgent(inv.agentId);
  if (agent) {
    await sendAgentInvoice(agent, inv.year, inv.month, "receipt").catch((err) =>
      console.error("[billplz] receipt email failed", err),
    );
  }
}

/**
 * Daily job: send this month's invoice once the trial is over, then one
 * reminder when it's due. Only for agents the admin switched online payment on for.
 */
export async function runBillingJob(now: Date = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const agents = await prisma.agent.findMany({
    where: { isSuperAdmin: false, isApproved: true, onlinePayment: true, branches: { some: { isDemo: false } } },
    select: {
      id: true, name: true, email: true, phone: true, isSuperAdmin: true, maxBranches: true, onlinePayment: true,
      companyRegistrationNo: true, companyAddress: true, createdAt: true,
      invoices: { where: { year, month } },
    },
  });

  const result = { sent: 0, reminded: 0, failed: [] as string[] };
  for (const { invoices, ...agent } of agents) {
    const action = invoiceAction(agent, invoices[0] ?? null, now);
    if (!action) continue;
    try {
      await sendAgentInvoice(agent, year, month, action === "send" ? "invoice" : "reminder");
      result[action === "send" ? "sent" : "reminded"]++;
    } catch (err) {
      console.error(`[billing] ${action} failed for ${agent.email}`, err);
      result.failed.push(agent.email);
    }
  }
  return result;
}
