import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * POST /api/upload/cleanup-r2
 * Delete an orphaned R2 object (e.g. when user cancels a duplicate upload).
 */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { r2Key } = await req.json();
  if (!r2Key || typeof r2Key !== "string") {
    return NextResponse.json({ error: "r2Key is required" }, { status: 400 });
  }

  if (!r2Key.startsWith("uploads/")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  // Verify the R2 key belongs to an upload owned by this agent
  const upload = await prisma.upload.findFirst({
    where: {
      r2Key,
      branch: { agentId: effective.agentId },
    },
    select: { id: true },
  });

  if (!upload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
      }),
    );
  } catch (err) {
    console.error("[cleanup-r2] Failed to delete", r2Key, err);
  }

  return NextResponse.json({ success: true });
}
