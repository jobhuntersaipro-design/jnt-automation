import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/billing";

/** True when the account has an invoice past its due day (see isOverdue). */
export async function agentOverdue(agentId: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      createdAt: true,
      isSuperAdmin: true,
      onlinePayment: true,
      invoices: { select: { year: true, month: true, paidAt: true } },
    },
  });
  return agent ? isOverdue(agent, agent.invoices) : false;
}
