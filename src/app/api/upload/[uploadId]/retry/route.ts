import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership, updateUploadStatus } from "@/lib/db/upload";
import { dispatchWorker } from "@/lib/upload/dispatch-worker";

/**
 * POST /api/upload/[uploadId]/retry
 * Re-runs the worker using the already-uploaded R2 file — no re-upload needed.
 * Works from FAILED state. Clears the previous error and restarts parsing.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "FAILED") {
    return NextResponse.json(
      { error: `Can only retry a FAILED upload (current: ${upload.status})` },
      { status: 409 },
    );
  }

  // Clear previous error and re-enter PROCESSING
  await updateUploadStatus(uploadId, "PROCESSING");
  await dispatchWorker(uploadId, "parse");

  return NextResponse.json({ status: "PROCESSING" });
}
