import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/v2/session";

/**
 * The account's outlet with this J&T code, created when new and the plan has room. Same limit
 * as v1's branches: sample branches don't count.
 */
export async function ensureOutlet(agentId: string, code: string): Promise<ActionResult<{ id: string; code: string; created: boolean }>> {
  const find = () => prisma.branch.findFirst({ where: { agentId, code }, select: { id: true, code: true } });
  const existing = await find();
  if (existing) return { ok: true, data: { ...existing, created: false } };
  const [agent, count] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { maxBranches: true } }),
    prisma.branch.count({ where: { agentId, isDemo: false } }),
  ]);
  if (agent && count >= agent.maxBranches) return { ok: false, error: "outlets.err.limit", vars: { limit: agent.maxBranches } };
  try {
    const outlet = await prisma.branch.create({ data: { agentId, code }, select: { id: true, code: true } });
    return { ok: true, data: { ...outlet, created: true } };
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    // Created at the same moment by another request.
    const raced = await find();
    return raced ? { ok: true, data: { ...raced, created: false } } : { ok: false, error: "error.invalid" };
  }
}
