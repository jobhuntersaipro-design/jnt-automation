import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership, updateUploadStatus } from "@/lib/db/upload";
import { processUnknown } from "@/lib/upload/pipeline";

/**
 * POST /api/upload/[uploadId]/process-unknown
 * Calculate salary for newly-created dispatchers and merge with existing preview.
 */
export async function POST(
  req: NextRequest,
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

  if (upload.status !== "NEEDS_ATTENTION") {
    return NextResponse.json(
      { error: "Upload is not in NEEDS_ATTENTION state" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { unknownExtIds } = body as { unknownExtIds?: string[] };

  if (!unknownExtIds || unknownExtIds.length === 0) {
    return NextResponse.json({ error: "No dispatcher IDs provided" }, { status: 400 });
  }

  // Set PROCESSING while we calculate
  await updateUploadStatus(uploadId, "PROCESSING");

  try {
    await processUnknown(uploadId, unknownExtIds);
    return NextResponse.json({ status: "READY_TO_CONFIRM" });
  } catch (err) {
    console.error("[process-unknown] Error:", err);
    await updateUploadStatus(
      uploadId,
      "FAILED",
      err instanceof Error ? err.message : "Failed to process unknown dispatchers",
    );
    return NextResponse.json(
      { error: "Failed to process unknown dispatchers" },
      { status: 500 },
    );
  }
}
