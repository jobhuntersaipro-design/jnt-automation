import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getJob } from "@/lib/staff/bulk-job";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job || job.agentId !== effective.agentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    done: job.done,
    total: job.total,
    year: job.year,
    month: job.month,
    format: job.format,
    error: job.error,
    ready: job.status === "done",
  });
}
