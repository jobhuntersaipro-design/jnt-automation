import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl, hasR2Object } from "@/lib/r2";
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
  if (job.status !== "done" || !job.r2Key) {
    return NextResponse.json(
      { error: "Export is not ready yet" },
      { status: 409 },
    );
  }

  if (!(await hasR2Object(job.r2Key))) {
    return NextResponse.json(
      { error: "Export file missing from storage" },
      { status: 410 },
    );
  }

  const mm = String(job.month).padStart(2, "0");
  const filename =
    job.kind === "payslip"
      ? `payslips_${job.branchCode ?? "export"}_${mm}_${job.year}.zip`
      : `${job.year}_${mm}_details.zip`;

  // Redirect the browser straight to R2 with a short-lived presigned URL.
  // The response payload no longer flows through this function — saves
  // function duration on Vercel and lets the browser stream to disk
  // without any proxying layer.
  const presignedUrl = await getPresignedDownloadUrl(job.r2Key, {
    filename,
    disposition: "attachment",
    contentType: "application/zip",
  });

  return NextResponse.redirect(presignedUrl, { status: 302 });
}
