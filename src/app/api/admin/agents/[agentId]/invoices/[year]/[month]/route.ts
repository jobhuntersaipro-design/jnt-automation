import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInvoiceAgent, upsertInvoice } from "@/lib/db/admin";
import { PRICE_PER_BRANCH, invoiceNumber, isValidYearMonth } from "@/lib/billing";
import { pdfResponseInit, renderAgentInvoice } from "@/lib/invoice-render";
import { sendInvoiceEmail } from "@/lib/email";

type Params = { params: Promise<{ agentId: string; year: string; month: string }> };

/** Superadmin check + param parsing shared by every handler. */
async function load({ params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const p = await params;
  const year = Number(p.year);
  const month = Number(p.month);
  if (!isValidYearMonth(year, month)) {
    return { error: NextResponse.json({ error: "Invalid month" }, { status: 400 }) };
  }
  const agent = await getInvoiceAgent(p.agentId);
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  return { agent, year, month };
}

// Download the invoice PDF
export async function GET(_req: NextRequest, ctx: Params) {
  const r = await load(ctx);
  if ("error" in r) return r.error;
  const { pdf, filename } = await renderAgentInvoice(r.agent, r.year, r.month);
  return new NextResponse(new Uint8Array(pdf), pdfResponseInit(filename));
}

// Mark the month paid / unpaid — body { paid: boolean }
export async function PATCH(req: NextRequest, ctx: Params) {
  const r = await load(ctx);
  if ("error" in r) return r.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.paid !== "boolean") {
    return NextResponse.json({ error: "paid must be a boolean" }, { status: 400 });
  }
  const inv = await upsertInvoice(r.agent.id, r.year, r.month, r.agent.maxBranches, PRICE_PER_BRANCH, {
    paidAt: body.paid ? new Date() : null,
  });
  return NextResponse.json(serialize(inv));
}

// Email the invoice PDF to the agent
export async function POST(_req: NextRequest, ctx: Params) {
  const r = await load(ctx);
  if ("error" in r) return r.error;

  // Record the send first so the PDF's issue date matches the email.
  const sentAt = new Date();
  const inv = await upsertInvoice(r.agent.id, r.year, r.month, r.agent.maxBranches, PRICE_PER_BRANCH, { sentAt });
  const { pdf, filename } = await renderAgentInvoice(r.agent, r.year, r.month);

  try {
    await sendInvoiceEmail({
      to: r.agent.email,
      name: r.agent.name,
      year: r.year,
      month: r.month,
      amount: inv.amount,
      branchCount: inv.branchCount,
      invoiceNo: invoiceNumber(r.agent.id, r),
      paid: Boolean(inv.paidAt),
      pdf,
      filename,
    });
  } catch (err) {
    console.error("[invoice] send failed", err);
    const message = err instanceof Error ? err.message : "Failed to send invoice";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json(serialize(inv));
}

function serialize(inv: Awaited<ReturnType<typeof upsertInvoice>>) {
  return {
    year: inv.year,
    month: inv.month,
    amount: inv.amount,
    branchCount: inv.branchCount,
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
  };
}
