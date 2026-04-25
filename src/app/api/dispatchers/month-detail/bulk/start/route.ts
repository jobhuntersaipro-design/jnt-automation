import { NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { createJob, updateJob } from "@/lib/staff/bulk-job";
import { runDispatchBulkExport } from "@/lib/staff/bulk-export-worker";
import { hasCached, zipKey } from "@/lib/staff/pdf-cache";

/**
 * POST /api/dispatchers/month-detail/bulk/start
 * Body: { year: number, month: number, format: "csv" | "pdf" }
 *
 * Queues a background export job and returns the job ID. Callers should
 * poll /api/dispatchers/month-detail/bulk/[jobId]/status until the job
 * reaches "done", then follow /download to pull the zip from R2.
 *
 * Short-circuit: if a canonical cached ZIP already exists for this
 * (agent, year, month, format) tuple, we skip the worker entirely and
 * return a pre-completed job record pointing at the cached blob.
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
  console.log(
    `[bulk-start] ${jobId.slice(0, 8)} agent=${effective.agentId.slice(0, 8)} ${year}-${String(month).padStart(2, "0")} ${format}`,
  );
  const job = await createJob({
    jobId,
    agentId: effective.agentId,
    year,
    month,
    format,
  });

  // Cache-hit short-circuit. Create a job record so the Downloads Panel
  // still shows it in the recent list, but flip it to `done` immediately
  // with the canonical R2 key. The bell's completion toast fires as
  // usual; the user sees "ready" within one poll.
  const cachedKey = zipKey(effective.agentId, year, month, format);
  if (await hasCached(cachedKey).catch(() => false)) {
    console.log(`[bulk-start] ${jobId.slice(0, 8)} cache HIT — short-circuit`);
    await updateJob(jobId, {
      status: "done",
      stage: "done",
      startedAt: Date.now(),
      r2Key: cachedKey,
    });
    return NextResponse.json({ jobId: job.jobId });
  }

  // Cache miss — normal worker dispatch.
  //
  // We wrap the dispatch in `after()` (Next.js 15+) so it runs AFTER the
  // 200 has been sent to the client but is still part of the same Vercel
  // function invocation. Without this, prod fire-and-forget races against
  // Vercel terminating the function the moment the response leaves — the
  // job stays at status="queued" and the user sees the spinner forever.
  // Dev (Node) keeps the promise alive regardless, which is why this only
  // surfaces in prod.
  console.log(`[bulk-start] ${jobId.slice(0, 8)} cache MISS — dispatching worker (via after())`);
  after(async () => {
    try {
      await runDispatchBulkExport(jobId);
    } catch (err) {
      console.error(
        `[bulk-start] ${jobId.slice(0, 8)} dispatch threw — marking job failed:`,
        err,
      );
      const message = err instanceof Error ? err.message : "Dispatch failed";
      await updateJob(jobId, { status: "failed", error: message }).catch(() => {});
    }
  });

  return NextResponse.json({ jobId: job.jobId });
}
