import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getDefaultAvatarById } from "@/lib/avatar/default-avatars";

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
      select: { id: true, avatarUrl: true },
    });
    if (!dispatcher) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { defaultId?: unknown };
    const defaultId = typeof body.defaultId === "string" ? body.defaultId : "";
    const avatar = getDefaultAvatarById(defaultId);
    if (!avatar) {
      return NextResponse.json({ error: "Unknown default avatar" }, { status: 400 });
    }

    // If the old avatar was an R2 upload, clean it up
    if (dispatcher.avatarUrl && dispatcher.avatarUrl.startsWith(`${R2_PUBLIC_URL}/`)) {
      const key = dispatcher.avatarUrl.replace(`${R2_PUBLIC_URL}/`, "").split("?")[0];
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (err) {
        // Non-fatal — orphaned objects can be cleaned up later
        console.error("[staff/avatar/default] R2 delete failed for key", key, err);
      }
    }

    await prisma.dispatcher.update({
      where: { id },
      data: { avatarUrl: avatar.url },
    });

    return NextResponse.json({ avatarUrl: avatar.url });
  } catch (err) {
    console.error("[staff/avatar/default] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
