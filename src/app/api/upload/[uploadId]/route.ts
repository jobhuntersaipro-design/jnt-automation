import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { deleteUploadData } from "@/lib/upload/pipeline";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * DELETE /api/upload/[uploadId]
 * Cancel/delete an upload at any mid-flow state.
 * Cleans up: DB row, KV data, R2 file.
 */
export async function DELETE(
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

  // Don't allow deleting SAVED uploads via this endpoint — use the replace flow instead
  if (upload.status === "SAVED") {
    return NextResponse.json(
      { error: "Cannot delete a saved upload. Use re-upload to replace." },
      { status: 400 },
    );
  }

  // Clean up KV data (meta + preview keys)
  await deleteUploadData(uploadId);

  // Clean up R2 file (best effort — don't fail if file doesn't exist)
  if (upload.r2Key) {
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: upload.r2Key }));
    } catch {
      // R2 cleanup is best-effort
    }
  }

  // Delete the Upload row (cascades SalaryRecords + SalaryLineItems if any)
  await prisma.upload.delete({ where: { id: uploadId } });

  return NextResponse.json({ success: true });
}
