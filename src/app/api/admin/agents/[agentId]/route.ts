import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { toggleAgentApproval, updateMaxBranches } from "@/lib/db/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId } = await params;
  const body = await req.json();

  if (typeof body.isApproved === "boolean") {
    const result = await toggleAgentApproval(agentId, body.isApproved);
    return NextResponse.json(result);
  }

  if (typeof body.maxBranches === "number" && body.maxBranches >= 1) {
    const result = await updateMaxBranches(agentId, body.maxBranches);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
