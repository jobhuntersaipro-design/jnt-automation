import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInvoiceAgent, upsertInvoice } from "@/lib/db/admin";
import { PRICE_PER_BRANCH, isValidYearMonth } from "@/lib/billing";
import { pdfResponseInit, renderAgentInvoice } from "@/lib/invoice-render";
import { sendAgentInvoice } from "@/lib/invoice-billing";
import { deleteBill } from "@/lib/billplz";
import { prisma } from "@/lib/prisma";

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
  if (body.paid && inv.billplzBillId) {
    // Paid outside Billplz (e.g. bank transfer): cancel the open bill so it can't be paid twice.
    await deleteBill(inv.billplzBillId)
      .then(() => prisma.invoice.update({
        where: { id: inv.id },
        data: { billplzBillId: null, billplzUrl: null, billplzAmount: null },
      }))
      .catch((err) => console.error("[billplz] cancel bill failed", err));
  }
  return NextResponse.json(serialize(inv));
}

// Email the invoice PDF (with a Billplz pay link when unpaid) to the agent
export async function POST(_req: NextRequest, ctx: Params) {
  const r = await load(ctx);
  if ("error" in r) return r.error;
  try {
    const inv = await sendAgentInvoice(r.agent, r.year, r.month);
    return NextResponse.json(serialize(inv));
  } catch (err) {
    console.error("[invoice] send failed", err);
    const message = err instanceof Error ? err.message : "Failed to send invoice";
    return NextResponse.json({ error: message }, { status: 502 });
  }
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
