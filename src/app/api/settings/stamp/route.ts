import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validateImageMagicBytes } from "@/lib/utils/validate-image";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.isApproved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agentId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate actual file content via magic bytes, not client-supplied MIME type
    const detectedType = validateImageMagicBytes(buffer);
    if (!detectedType) {
      return NextResponse.json({ error: "Only JPG, PNG, and WebP files are allowed" }, { status: 400 });
    }

    const ext = detectedType === "image/jpeg" ? "jpg" : detectedType.split("/")[1];
    const key = `stamps/${agentId}/stamp.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: detectedType,
      }),
    );

    const stampImageUrl = `${R2_PUBLIC_URL}/${key}`;

    await prisma.agent.update({
      where: { id: agentId },
      data: { stampImageUrl },
    });

    return NextResponse.json({ stampImageUrl });
  } catch (err) {
    console.error("[settings/stamp] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.isApproved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agentId = session.user.id;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { stampImageUrl: true },
    });

    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (agent.stampImageUrl) {
      const key = agent.stampImageUrl.replace(`${R2_PUBLIC_URL}/`, "");
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          }),
        );
      } catch (err) {
        // R2 deletion failure is non-fatal — orphaned objects can be cleaned up later
        console.error("[settings/stamp] R2 delete failed for key", key, err);
      }
    }

    await prisma.agent.update({
      where: { id: agentId },
      data: { stampImageUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settings/stamp] DELETE error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
