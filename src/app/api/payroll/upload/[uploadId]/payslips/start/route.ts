import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { createJob } from "@/lib/staff/bulk-job";
import { dispatchPayslipBulk } from "@/lib/payroll/payslip-bulk-worker";

/**
 * Async bulk-payslip start. The sync route next door stays for
 * single-dispatcher downloads (instant PDF). Multi-dispatcher requests
 * should come here so the UI doesn't block on a 10 s+ render.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, effective.agentId);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }
  if (upload.status !== "SAVED") {
    return NextResponse.json(
      { error: `Cannot generate payslips in ${upload.status} state` },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const dispatcherIds: string[] = Array.isArray(body?.dispatcherIds) ? body.dispatcherIds : [];

  if (dispatcherIds.length === 0) {
    return NextResponse.json({ error: "No dispatchers selected" }, { status: 400 });
  }
  // Higher cap than the sync route (50) since the job runs off the request
  // thread. Still bounded — 200 PDFs at 4× concurrency is ~1 minute of work.
  if (dispatcherIds.length > 200) {
    return NextResponse.json(
      { error: "Cannot queue more than 200 payslips at once" },
      { status: 400 },
    );
  }

  const fullUpload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      month: true,
      year: true,
      branch: { select: { code: true, agentId: true } },
    },
  });
  if (!fullUpload || fullUpload.branch.agentId !== effective.agentId) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const jobId = randomUUID();
  await createJob({
    jobId,
    agentId: effective.agentId,
    kind: "payslip",
    year: fullUpload.year,
    month: fullUpload.month,
    format: "pdf",
    uploadId,
    dispatcherIds,
    branchCode: fullUpload.branch.code,
  });

  dispatchPayslipBulk(jobId);

  return NextResponse.json({ jobId });
}
