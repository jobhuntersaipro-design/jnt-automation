import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getPrewarmJob } from "@/lib/staff/prewarm-job";

/**
 * GET /api/payroll-cache/status?year=2026&month=3
 *
 * Returns the current prewarm state for (effective agent, year, month).
 * Drives the Payroll page's "Preparing downloads…" indicator and the PDF
 * button disable state. Polling from the client — typical cadence 2 s
 * while `status === "running"`, 10 s otherwise.
 *
 * Shape: always returns a JSON object with either state fields or
 * `{ status: "idle" }` if no prewarm has ever been enqueued for this
 * month. Idle means nothing is warming AND nothing needs to — either the
 * cache is already fully warm (R2 ready) or no upload exists yet.
 */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const state = await getPrewarmJob(effective.agentId, year, month);
  if (!state) {
    return NextResponse.json({ status: "idle" });
  }

  return NextResponse.json({
    status: state.status,
    total: state.total,
    done: state.done,
    totalChunks: state.totalChunks,
    doneChunks: state.doneChunks,
    reason: state.reason,
    error: state.error,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  });
}
