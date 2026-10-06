import { getInvoice, getInvoiceAgent } from "@/lib/db/admin";
import { PRICE_PER_BRANCH, invoiceNumber } from "@/lib/billing";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export type InvoiceAgent = NonNullable<Awaited<ReturnType<typeof getInvoiceAgent>>>;

/**
 * Render an agent's invoice PDF for a month. Paid months use the amount they
 * were paid at; unpaid ones follow the current branch limit.
 */
export async function renderAgentInvoice(agent: InvoiceAgent, year: number, month: number) {
  const invoice = await getInvoice(agent.id, year, month);
  const branchCount = invoice?.paidAt ? invoice.branchCount : agent.maxBranches;
  const unitPrice = invoice?.paidAt ? invoice.unitPrice : PRICE_PER_BRANCH;
  const pdf = await generateInvoicePdf({
    agentId: agent.id,
    agentName: agent.name,
    agentEmail: agent.email,
    agentPhone: agent.phone,
    companyRegistrationNo: agent.companyRegistrationNo,
    companyAddress: agent.companyAddress,
    year,
    month,
    branchCount,
    unitPrice,
    amount: branchCount * unitPrice,
    issuedAt: invoice?.sentAt ?? new Date(),
    paidAt: invoice?.paidAt ?? null,
  });
  return { pdf, filename: `${invoiceNumber(agent.id, { year, month })}.pdf` };
}

export function pdfResponseInit(filename: string): ResponseInit {
  return {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  };
}
