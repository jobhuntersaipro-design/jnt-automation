import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";

/**
 * Canonical cache keys for pre-stored per-dispatcher PDFs / CSVs and the
 * per-month bulk ZIP. All keys live under `payroll-cache/` — separate from
 * the existing `bulk-exports/` pointer blobs that have a 30-day R2 lifecycle
 * rule. Cache blobs persist until explicitly invalidated by the mutation
 * that changes their content (recalculate / upload replace / upload delete).
 *
 * Keys are shared across users within an agent — any click reuses the same
 * blob. Per spec: `context/features/pdf-cache-spec.md`.
 */

function mm(month: number): string {
  return String(month).padStart(2, "0");
}

export function pdfKey(
  agentId: string,
  year: number,
  month: number,
  salaryRecordId: string,
): string {
  return `payroll-cache/${agentId}/${year}-${mm(month)}/${salaryRecordId}.pdf`;
}

export function csvKey(
  agentId: string,
  year: number,
  month: number,
  salaryRecordId: string,
): string {
  return `payroll-cache/${agentId}/${year}-${mm(month)}/${salaryRecordId}.csv`;
}

export function zipKey(
  agentId: string,
  year: number,
  month: number,
  format: "pdf" | "csv",
): string {
  return `payroll-cache/${agentId}/${year}-${mm(month)}/details.${format}.zip`;
}

/**
 * HEAD check — cheaper than GET when all we need is existence. Used by the
 * `/bulk/start` short-circuit and by the per-record download routes to
 * decide between "redirect to presigned URL" and "generate inline". Returns
 * false on 404, propagates other errors so observability stays intact.
 */
export async function hasCached(key: string): Promise<boolean> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (err: unknown) {
    if (isNotFoundError(err)) return false;
    throw err;
  }
}

export async function putCached(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Batch-delete cache blobs. R2 DeleteObjects caps at 1000 keys per call,
 * so we chunk. Non-existent keys are silently ignored.
 */
export async function deleteCachedBlobs(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

/**
 * Build the full set of cache keys that cover a (agent, year, month,
 * salaryRecordIds) tuple — per-dispatcher PDF + CSV for each record plus
 * both bulk ZIPs. Used by invalidation call sites.
 */
export function cacheKeysForRecords(
  agentId: string,
  year: number,
  month: number,
  salaryRecordIds: string[],
): string[] {
  const perRecord = salaryRecordIds.flatMap((id) => [
    pdfKey(agentId, year, month, id),
    csvKey(agentId, year, month, id),
  ]);
  return [
    ...perRecord,
    zipKey(agentId, year, month, "pdf"),
    zipKey(agentId, year, month, "csv"),
  ];
}

/**
 * Evict every cached blob that belongs to an upload. Called before a
 * replace flow cascades away the `SalaryRecord` rows — once the rows are
 * gone we lose the salaryRecordId → cacheKey mapping and the blobs become
 * orphans with no TTL to clean them up (cache keys have no R2 lifecycle).
 *
 * Safe to call on uploads in any state; returns silently when no salary
 * records exist yet.
 */
export async function invalidateCacheForUpload(
  agentId: string,
  uploadId: string,
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, branch: { agentId } },
    select: { year: true, month: true },
  });
  if (!upload) return;

  const records = await prisma.salaryRecord.findMany({
    where: { uploadId },
    select: { id: true },
  });
  if (records.length === 0) return;

  await deleteCachedBlobs(
    cacheKeysForRecords(
      agentId,
      upload.year,
      upload.month,
      records.map((r) => r.id),
    ),
  );
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (e.name === "NoSuchKey" || e.name === "NotFound") return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}
