import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { createJob } from "@/lib/staff/bulk-job";
import { dispatchBulkExport } from "@/lib/staff/bulk-export-worker";

/**
 * POST /api/dispatchers/month-detail/bulk/start
 * Body: { year: number, month: number, format: "csv" | "pdf" }
 *
 * Queues a background export job and returns the job ID. Callers should
 * poll /api/dispatchers/month-detail/bulk/[jobId]/status until the job
 * reaches "done", then follow /download to pull the zip from R2.
 */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const year = Number(body?.year);
  const month = Number(body?.month);
  const format = body?.format === "pdf" ? "pdf" : "csv";

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const jobId = randomUUID();
  const job = await createJob({
    jobId,
    agentId: effective.agentId,
    year,
    month,
    format,
  });

  // Fire-and-forget — request returns immediately so the client can start
  // polling and show progress on the notification bell.
  dispatchBulkExport(jobId);

  return NextResponse.json({ jobId: job.jobId });
}
