import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createUpload, replaceUpload } from "@/lib/db/upload";

const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = session.user.id;
  const body = await req.json();
  const { fileName, branchCode, month, year, confirmReplace } = body as {
    fileName?: string;
    branchCode?: string;
    month?: number;
    year?: number;
    confirmReplace?: boolean;
  };

  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  // Validate file extension
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Only .xlsx and .xls files are allowed" },
      { status: 400 },
    );
  }

  const contentType = ext === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/vnd.ms-excel";

  // ─── Auto-detect mode: no branch/month/year provided ───────────
  // Just generate a presigned URL for R2 upload — no Upload row yet.
  // The client will call POST /api/upload/detect after uploading to R2.
  if (!branchCode || !month || !year) {
    const r2Key = `uploads/${agentId}/pending/${Date.now()}-${fileName}`;

    const presignedUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, ContentType: contentType }),
      { expiresIn: 300 },
    );

    return NextResponse.json({ r2Key, presignedUrl });
  }

  // ─── Manual mode: branch/month/year provided (legacy) ──────────

  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
  }

  // Verify branch belongs to this agent
  const branch = await prisma.branch.findFirst({
    where: { code: branchCode, agentId },
    select: { id: true, code: true },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const r2Key = `uploads/${agentId}/${branch.code}/${year}-${String(month).padStart(2, "0")}/${Date.now()}-${fileName}`;

  // Check for duplicate or create upload
  if (!confirmReplace) {
    const result = await createUpload({
      branchId: branch.id,
      fileName,
      r2Key,
      month,
      year,
    });

    if (result.isDuplicate) {
      return NextResponse.json({
        isDuplicate: true,
        existingUploadId: result.existingUploadId,
        message: `Payroll for ${branchCode} — ${monthName(month)} ${year} already exists. Re-uploading will delete existing salary records. Dispatcher settings will be kept. This cannot be undone.`,
      });
    }

    const presignedUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, ContentType: contentType }),
      { expiresIn: 300 },
    );

    return NextResponse.json({
      isDuplicate: false,
      uploadId: result.uploadId,
      presignedUrl,
    });
  }

  // confirmReplace = true — delete old and create new
  const { existingUploadId } = body as { existingUploadId?: string };
  if (!existingUploadId) {
    return NextResponse.json({ error: "Missing existingUploadId" }, { status: 400 });
  }

  // Evict PDF cache blobs for the old salary records BEFORE the cascade
  // delete wipes them — once the records are gone we lose the record-id →
  // cache-key mapping and the blobs become permanent orphans.
  const { invalidateCacheForUpload } = await import("@/lib/staff/pdf-cache");
  await invalidateCacheForUpload(session.user.id, existingUploadId).catch(
    (err) => console.error("[pdf-cache] invalidate failed:", err),
  );

  const uploadId = await replaceUpload({
    existingUploadId,
    agentId: session.user.id,
    branchId: branch.id,
    fileName,
    r2Key,
    month,
    year,
  });

  const presignedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  return NextResponse.json({
    isDuplicate: false,
    uploadId,
    presignedUrl,
  });
}

function monthName(month: number): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return names[month - 1] ?? "Unknown";
}
