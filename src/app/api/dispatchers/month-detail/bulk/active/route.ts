import { NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { listActiveJobs } from "@/lib/staff/bulk-job";

/**
 * GET /api/dispatchers/month-detail/bulk/active
 * Returns bulk-export jobs that are currently queued or running for the
 * authenticated agent. Used by the notification-bell indicator to show a
 * progress ring while work is in flight.
 */
export async function GET() {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listActiveJobs(effective.agentId);
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      jobId: j.jobId,
      status: j.status,
      done: j.done,
      total: j.total,
      year: j.year,
      month: j.month,
      format: j.format,
    })),
  });
}
