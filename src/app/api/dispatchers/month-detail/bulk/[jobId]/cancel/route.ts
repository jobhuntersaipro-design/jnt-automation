import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { cancelJob } from "@/lib/staff/bulk-job";

/**
 * POST /api/dispatchers/month-detail/bulk/[jobId]/cancel
 * Marks an in-flight job as failed so the UI stops showing progress and the
 * row can be cleared. Agent-scoped — a caller can only cancel their own
 * jobs. Any ongoing worker continues in the background until it naturally
 * hits an `updateJob` write (which no-ops once the record is terminal).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const ok = await cancelJob(jobId, effective.agentId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
