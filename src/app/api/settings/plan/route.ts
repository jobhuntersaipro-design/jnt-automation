import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { setBranchLimit } from "@/lib/db/admin";
import { planLimitError } from "@/lib/billing";
import { sendPlanChangeNotification } from "@/lib/email";

// Agent changes their own branch limit. Takes effect immediately; the next
// unpaid invoice follows the new limit.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isApproved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const requested = body?.maxBranches;
  if (typeof requested !== "number") {
    return NextResponse.json({ error: "maxBranches must be a number" }, { status: 400 });
  }

  const agentId = session.user.id;
  const [agent, branchesInUse] = await Promise.all([
    prisma.agent.findUnique({ where: { id: agentId }, select: { name: true, email: true, maxBranches: true } }),
    prisma.branch.count({ where: { agentId, isDemo: false } }),
  ]);
  if (!agent) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const error = planLimitError(requested, branchesInUse);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const previous = await setBranchLimit(agentId, requested, { changedBy: "agent", actorEmail: agent.email });
  if (previous !== null) {
    await sendPlanChangeNotification(agent.email, agent.name, previous, requested);
  }

  return NextResponse.json({ maxBranches: requested });
}
