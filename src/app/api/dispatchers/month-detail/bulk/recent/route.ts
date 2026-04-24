import { NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { clearRecent, listRecent } from "@/lib/staff/bulk-job";

/**
 * GET /api/dispatchers/month-detail/bulk/recent
 * Returns the Downloads Center list: active + recently-completed bulk-export
 * jobs for the authenticated agent, sorted by updatedAt desc, capped at
 * RECENT_RETURN_LIMIT.
 */
export async function GET() {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await listRecent(effective.agentId);
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      jobId: j.jobId,
      status: j.status,
      stage: j.stage ?? (j.status === "done" ? "done" : j.status === "queued" ? "queued" : "generating"),
      done: j.done,
      total: j.total,
      year: j.year,
      month: j.month,
      format: j.format,
      kind: j.kind ?? "month-detail",
      branchCode: j.branchCode,
      currentLabel: j.currentLabel,
      error: j.error,
      startedAt: j.startedAt ?? null,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  });
}

/**
 * DELETE /api/dispatchers/month-detail/bulk/recent
 * Hard-clears the agent's recent-exports list. Active in-flight jobs are
 * untouched — this only wipes the Downloads Center history.
 */
export async function DELETE() {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearRecent(effective.agentId);
  return NextResponse.json({ ok: true });
}
