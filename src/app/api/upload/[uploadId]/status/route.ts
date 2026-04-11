import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUploadStatus } from "@/lib/db/upload";
import { getUploadMeta } from "@/lib/upload/pipeline";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await getUploadStatus(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Include parsing metadata when in CONFIRM_SETTINGS state
  let meta = null;
  if (upload.status === "CONFIRM_SETTINGS") {
    meta = await getUploadMeta(uploadId);
  }

  return NextResponse.json({
    status: upload.status,
    errorMessage: upload.errorMessage,
    fileName: upload.fileName,
    month: upload.month,
    year: upload.year,
    ...(meta && {
      knownCount: meta.knownCount,
      unknownDispatchers: meta.unknownDispatchers,
    }),
  });
}
