import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";

/**
 * The signed-in (or impersonated) agent, only if their account is on v2.
 * v2 pages redirect and v2 API routes return 403 when this is null, so a v1
 * account can never reach v2 code even by calling the API directly.
 */
export async function getV2Agent() {
  const effective = await getEffectiveAgentId();
  if (!effective) return null;
  const agent = await prisma.agent.findUnique({
    where: { id: effective.agentId },
    select: { uiVersion: true },
  });
  return agent?.uiVersion === "V2" ? effective : null;
}
