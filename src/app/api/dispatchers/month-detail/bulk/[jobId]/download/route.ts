import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
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

  const obj = await r2.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: job.r2Key }),
  );
  if (!obj.Body) {
    return NextResponse.json(
      { error: "Export file missing from storage" },
      { status: 410 },
    );
  }

  const bytes = await obj.Body.transformToByteArray();
  const mm = String(job.month).padStart(2, "0");
  const filename =
    job.kind === "payslip"
      ? `payslips_${job.branchCode ?? "export"}_${mm}_${job.year}.zip`
      : `${job.year}_${mm}_details.zip`;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
