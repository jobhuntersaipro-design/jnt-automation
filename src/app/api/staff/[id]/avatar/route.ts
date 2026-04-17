import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { validateImageMagicBytes } from "@/lib/utils/validate-image";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;

    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId } },
      select: { id: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
    const key = `avatars/${agentId}/${id}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: detectedType,
      }),
    );

    const avatarUrl = `${R2_PUBLIC_URL}/${key}`;

    await prisma.dispatcher.update({
      where: { id },
      data: { avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("[staff/avatar] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;

    const dispatcher = await prisma.dispatcher.findFirst({
      where: { id, branch: { agentId } },
      select: { id: true, avatarUrl: true },
    });

    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (dispatcher.avatarUrl) {
      const key = dispatcher.avatarUrl.replace(`${R2_PUBLIC_URL}/`, "");
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          }),
        );
      } catch (err) {
        // R2 deletion failure is non-fatal — orphaned objects can be cleaned up later
        console.error("[staff/avatar] R2 delete failed for key", key, err);
      }
    }

    await prisma.dispatcher.update({
      where: { id },
      data: { avatarUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff/avatar] DELETE error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
