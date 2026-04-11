import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Client } from "@upstash/qstash";
import { updateUploadStatus, verifyUploadOwnership } from "@/lib/db/upload";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  // Verify ownership and that upload is in a valid state for processing
  const upload = await verifyUploadOwnership(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "UPLOADING" && upload.status !== "FAILED") {
    return NextResponse.json(
      { error: `Cannot process upload in ${upload.status} state` },
      { status: 409 },
    );
  }

  // Update status to PROCESSING
  await updateUploadStatus(uploadId, "PROCESSING");

  // Queue background job via QStash
  const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/upload/worker`;

  await qstash.publishJSON({
    url: workerUrl,
    body: { uploadId },
    retries: 2,
  });

  return NextResponse.json({ status: "PROCESSING" });
}
