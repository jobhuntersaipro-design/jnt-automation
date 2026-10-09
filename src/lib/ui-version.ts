import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";

/** A v2 team member (branch supervisor): who they are and the owner's branches they work on. */
export interface V2Member {
  id: string;
  branchIds: string[];
}

/**
 * The signed-in (or impersonated) agent, only if their account is on v2.
 * v2 pages redirect and v2 API routes return 403 when this is null, so a v1
 * account can never reach v2 code even by calling the API directly.
 * A team member resolves to their owner's account (`agentId`) with `member` set; they lose
 * access when the owner's account is disabled or leaves v2.
 */
export async function getV2Agent() {
  const effective = await getEffectiveAgentId();
  if (!effective) return null;
  const agent = await prisma.agent.findUnique({
    where: { id: effective.agentId },
    select: { uiVersion: true, ownerId: true, teamBranchIds: true, owner: { select: { uiVersion: true, isApproved: true } } },
  });
  if (agent?.uiVersion !== "V2") return null;
  if (!agent.ownerId) return { ...effective, member: null as V2Member | null };
  if (agent.owner?.uiVersion !== "V2" || !agent.owner.isApproved) return null;
  return { ...effective, agentId: agent.ownerId, member: { id: effective.agentId, branchIds: agent.teamBranchIds } as V2Member | null };
}
