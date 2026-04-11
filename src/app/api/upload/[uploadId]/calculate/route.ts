import { NextRequest, NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { auth } from "@/auth";
import { verifyUploadOwnership, updateUploadStatus } from "@/lib/db/upload";

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

  const upload = await verifyUploadOwnership(uploadId, session.user.id);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "CONFIRM_SETTINGS") {
    return NextResponse.json(
      { error: `Cannot calculate in ${upload.status} state` },
      { status: 409 },
    );
  }

  // Set PROCESSING and queue calculation via QStash
  await updateUploadStatus(uploadId, "PROCESSING");

  const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/upload/worker`;

  await qstash.publishJSON({
    url: workerUrl,
    body: { uploadId, phase: "calculate" },
    retries: 2,
  });

  return NextResponse.json({ status: "PROCESSING" });
}
