import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getInvoiceAgent } from "@/lib/db/admin";
import { billingStatus, isValidYearMonth } from "@/lib/billing";
import { pdfResponseInit, renderAgentInvoice } from "@/lib/invoice-render";
import { prisma } from "@/lib/prisma";

// Agent downloads their own invoice PDF for a billable month.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ year: string; month: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isApproved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const p = await params;
  const year = Number(p.year);
  const month = Number(p.month);
  if (!isValidYearMonth(year, month)) return NextResponse.json({ error: "Invalid month" }, { status: 400 });

  const agent = await getInvoiceAgent(session.user.id);
  if (!agent) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const invoices = await prisma.invoice.findMany({
    where: { agentId: agent.id, year, month },
    select: { year: true, month: true, paidAt: true },
  });
  const status = billingStatus(agent, invoices, { year, month });
  if (status === "trial" || status === "exempt") {
    return NextResponse.json({ error: "No invoice for this month" }, { status: 404 });
  }

  const { pdf, filename } = await renderAgentInvoice(agent, year, month);
  return new NextResponse(new Uint8Array(pdf), pdfResponseInit(filename));
}
