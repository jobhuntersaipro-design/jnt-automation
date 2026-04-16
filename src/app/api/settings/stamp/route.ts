import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function validateImageMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // JPEG: starts with FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  // PNG: starts with 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  // WebP: bytes 8-11 are "WEBP"
  if (buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

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
