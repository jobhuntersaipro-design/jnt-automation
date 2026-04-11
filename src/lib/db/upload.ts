import { prisma } from "@/lib/prisma";
import { UploadStatus } from "@/generated/prisma/client";

/**
 * Create an Upload row in UPLOADING state.
 * If a SAVED upload already exists for the same branch+month+year, returns isDuplicate: true
 * but does NOT delete the old one yet — the client must confirm first.
 */
export async function createUpload(args: {
  branchId: string;
  fileName: string;
  r2Key: string;
  month: number;
  year: number;
}) {
  // Check for existing SAVED upload on the same slot
  const existing = await prisma.upload.findUnique({
    where: {
      branchId_month_year: {
        branchId: args.branchId,
        month: args.month,
        year: args.year,
      },
    },
    select: { id: true, status: true },
  });

  const isDuplicate = existing?.status === "SAVED";

  // If there's a non-SAVED upload (e.g. FAILED, UPLOADING), clean it up
  if (existing && existing.status !== "SAVED") {
    await prisma.upload.delete({ where: { id: existing.id } });
  }

  // For duplicates, don't create yet — client must confirm replacement first
  if (isDuplicate) {
    return { isDuplicate: true, existingUploadId: existing.id, uploadId: null };
  }

  const upload = await prisma.upload.create({
    data: {
      branchId: args.branchId,
      fileName: args.fileName,
      r2Key: args.r2Key,
      month: args.month,
      year: args.year,
      status: "UPLOADING",
    },
  });

  return { isDuplicate: false, existingUploadId: null, uploadId: upload.id };
}

/**
 * Replace an existing SAVED upload: delete old salary records + upload,
 * then create a fresh Upload row.
 */
export async function replaceUpload(args: {
  existingUploadId: string;
  agentId: string;
  branchId: string;
  fileName: string;
  r2Key: string;
  month: number;
  year: number;
}) {
  return prisma.$transaction(async (tx) => {
    // Verify ownership before deleting
    const existing = await tx.upload.findFirst({
      where: { id: args.existingUploadId, branch: { agentId: args.agentId } },
      select: { id: true },
    });
    if (!existing) throw new Error("Upload not found");

    // Cascade deletes SalaryRecords + SalaryLineItems
    await tx.upload.delete({ where: { id: args.existingUploadId } });

    const upload = await tx.upload.create({
      data: {
        branchId: args.branchId,
        fileName: args.fileName,
        r2Key: args.r2Key,
        month: args.month,
        year: args.year,
        status: "UPLOADING",
      },
    });

    return upload.id;
  });
}

/**
 * Update upload status.
 */
export async function updateUploadStatus(
  uploadId: string,
  status: UploadStatus,
  errorMessage?: string,
) {
  await prisma.upload.update({
    where: { id: uploadId },
    data: { status, errorMessage: errorMessage ?? null },
  });
}

/**
 * Get upload with status info for polling.
 */
export async function getUploadStatus(uploadId: string, agentId: string) {
  return prisma.upload.findFirst({
    where: {
      id: uploadId,
      branch: { agentId },
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      fileName: true,
      month: true,
      year: true,
      branchId: true,
    },
  });
}

/**
 * Mark stale PROCESSING uploads as FAILED (> 5 minutes old).
 */
export async function markStaleUploadsFailed(agentId: string) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // updateMany doesn't support nested relation filters,
  // so find stale IDs first, then bulk-update by ID list
  const stale = await prisma.upload.findMany({
    where: {
      branch: { agentId },
      status: "PROCESSING",
      updatedAt: { lt: fiveMinutesAgo },
    },
    select: { id: true },
  });

  if (stale.length === 0) return;

  await prisma.upload.updateMany({
    where: { id: { in: stale.map((u) => u.id) } },
    data: {
      status: "FAILED",
      errorMessage: "Processing timed out. Please retry.",
    },
  });
}

/**
 * Verify upload belongs to agent.
 */
export async function verifyUploadOwnership(uploadId: string, agentId: string) {
  const upload = await prisma.upload.findFirst({
    where: {
      id: uploadId,
      branch: { agentId },
    },
    select: { id: true, status: true, r2Key: true, branchId: true },
  });

  return upload;
}
