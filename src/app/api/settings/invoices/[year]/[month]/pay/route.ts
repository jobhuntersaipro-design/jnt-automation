import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInvoiceAgent, upsertInvoice } from "@/lib/db/admin";
import { PRICE_PER_BRANCH, billingStatus, isValidYearMonth } from "@/lib/billing";
import { billplzConfigured } from "@/lib/billplz";
import { paymentLinkFor } from "@/lib/invoice-billing";
import { prisma } from "@/lib/prisma";

// Agent starts an online payment for one of their own due months → { url } of the Billplz bill.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isApproved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!billplzConfigured()) return NextResponse.json({ error: "Online payment isn't available yet" }, { status: 503 });

  const p = await params;
  const year = Number(p.year);
  const month = Number(p.month);
  if (!isValidYearMonth(year, month)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });

  const agent = await getInvoiceAgent(session.user.id);
  if (!agent) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const existing = await prisma.invoice.findMany({
    where: { agentId: agent.id, year, month },
    select: { year: true, month: true, paidAt: true },
  });
  if (billingStatus(agent, existing, { year, month }) !== "unpaid") {
    return NextResponse.json({ error: "Nothing to pay for this month" }, { status: 400 });
  }

  const inv = await upsertInvoice(agent.id, year, month, agent.maxBranches, PRICE_PER_BRANCH, {});
  try {
    const url = await paymentLinkFor(agent, inv);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billplz] create bill failed", err);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }
}
