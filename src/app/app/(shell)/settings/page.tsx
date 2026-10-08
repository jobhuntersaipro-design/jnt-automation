import { notFound } from "next/navigation";
import { Settings } from "@/components/v2/settings/settings";
import { billableMonths, billingStatus, firstBillableMonth, isInTrial, monthKey, PRICE_PER_BRANCH, SELF_SERVE_MAX_BRANCHES, trialEndDate } from "@/lib/billing";
import { billplzConfigured } from "@/lib/billplz";
import { prisma } from "@/lib/prisma";
import { SUPPORT_EMAIL } from "@/lib/support";
import { getV2Agent } from "@/lib/ui-version";
import { toPeriod } from "@/lib/v2/pay/resolve";

const MONTHS_SHOWN = 12;

export default async function SettingsPage() {
  const v2 = await getV2Agent();
  if (!v2) notFound();
  const agent = await prisma.agent.findUnique({
    where: { id: v2.agentId },
    select: {
      name: true,
      email: true,
      password: true,
      companyRegistrationNo: true,
      companyAddress: true,
      stampImageUrl: true,
      createdAt: true,
      maxBranches: true,
      onlinePayment: true,
      isSuperAdmin: true,
      invoices: { select: { year: true, month: true, branchCount: true, amount: true, paidAt: true } },
      _count: { select: { branches: { where: { isDemo: false } } } },
    },
  });
  if (!agent) notFound();

  // Billing as v1's Settings works it out: paid months keep what they were paid at, open months bill the current limit.
  const now = new Date();
  const thisMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const first = firstBillableMonth(agent.createdAt);
  const next = monthKey(first) > monthKey(thisMonth) ? first : thisMonth;
  const invoices = billableMonths(agent.createdAt, now)
    .slice(0, MONTHS_SHOWN)
    .flatMap((ym) => {
      const status = billingStatus(agent, agent.invoices, ym);
      if (status !== "paid" && status !== "unpaid") return [];
      const inv = agent.invoices.find((i) => i.year === ym.year && i.month === ym.month);
      const outlets = inv?.paidAt ? inv.branchCount : agent.maxBranches;
      return [{ period: toPeriod(ym.year, ym.month), outlets, amount: inv?.paidAt ? inv.amount : outlets * PRICE_PER_BRANCH, paid: status === "paid" }];
    });

  return (
    <Settings
      viewingAs={v2.impersonating ? (v2.impersonatedName ?? agent.name) : null}
      account={{
        name: agent.name,
        email: agent.email,
        companyRegistrationNo: agent.companyRegistrationNo,
        companyAddress: agent.companyAddress,
        stampImageUrl: agent.stampImageUrl,
        hasPassword: agent.password !== null,
      }}
      plan={{
        limit: agent.maxBranches,
        inUse: agent._count.branches,
        max: SELF_SERVE_MAX_BRANCHES,
        price: PRICE_PER_BRANCH,
        exempt: agent.isSuperAdmin,
        trialEnd: isInTrial(agent.createdAt, now) ? trialEndDate(agent.createdAt).toISOString() : null,
        firstInvoice: toPeriod(first.year, first.month),
        nextInvoice: toPeriod(next.year, next.month),
        payOnline: agent.onlinePayment && billplzConfigured(),
        supportEmail: SUPPORT_EMAIL,
        invoices,
      }}
    />
  );
}
