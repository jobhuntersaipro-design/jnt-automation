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

    const employee = await prisma.employee.findFirst({
      where: { id, agentId },
      select: { id: true },
    });

    if (!employee) {
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

    const detectedType = validateImageMagicBytes(buffer);
    if (!detectedType) {
      return NextResponse.json({ error: "Only JPG, PNG, and WebP files are allowed" }, { status: 400 });
    }

    const ext = detectedType === "image/jpeg" ? "jpg" : detectedType.split("/")[1];
    const key = `avatars/${agentId}/employee-${id}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: detectedType,
      }),
    );

    const avatarUrl = `${R2_PUBLIC_URL}/${key}?v=${Date.now()}`;

    await prisma.employee.update({
      where: { id },
      data: { avatarUrl },
    });

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("[employees/avatar] POST error", err);
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

    const employee = await prisma.employee.findFirst({
      where: { id, agentId },
      select: { id: true, avatarUrl: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (employee.avatarUrl && employee.avatarUrl.startsWith(`${R2_PUBLIC_URL}/`)) {
      const key = employee.avatarUrl.replace(`${R2_PUBLIC_URL}/`, "").split("?")[0];
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (err) {
        console.error("[employees/avatar] R2 delete failed for key", key, err);
      }
    }

    await prisma.employee.update({
      where: { id },
      data: { avatarUrl: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[employees/avatar] DELETE error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
