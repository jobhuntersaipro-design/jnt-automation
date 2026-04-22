import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export type UploadStage =
  | "parse" // Excel → rows
  | "split" // Known vs unknown dispatcher classification
  | "calculate" // Salary calculation per dispatcher
  | "save"; // Committing preview / final save

export interface UploadProgress {
  stage: UploadStage;
  stageLabel: string;
  rowsParsed?: number;
  dispatchersFound?: number;
  dispatchersProcessed?: number;
  totalDispatchers?: number;
  /** Number of SalaryLineItem rows inserted (save stage, confirm flow) */
  lineItemsInserted?: number;
  /** Total SalaryLineItem rows to be inserted (save stage, confirm flow) */
  totalLineItems?: number;
  startedAt: number;
  updatedAt: number;
}

const progressKey = (uploadId: string) => `progress:${uploadId}`;
const TTL_SECONDS = 7200;

export async function setProgress(
  uploadId: string,
  progress: Omit<UploadProgress, "updatedAt"> & { updatedAt?: number },
): Promise<void> {
  const payload: UploadProgress = {
    ...progress,
    updatedAt: Date.now(),
  };
  await redis.set(progressKey(uploadId), payload, { ex: TTL_SECONDS });
}

export async function getProgress(
  uploadId: string,
): Promise<UploadProgress | null> {
  return redis.get<UploadProgress>(progressKey(uploadId));
}

export async function clearProgress(uploadId: string): Promise<void> {
  await redis.del(progressKey(uploadId));
}

/**
 * Throttle factory: returns a function that writes progress to KV at
 * most once every `intervalMs`. Used to report row-parsing progress
 * without hammering Redis on every row.
 */
export function throttledProgressWriter(
  uploadId: string,
  intervalMs = 500,
): (partial: Partial<UploadProgress> & { stage: UploadStage; stageLabel: string; startedAt: number }) => void {
  let lastWrite = 0;
  let pending: ReturnType<typeof setProgress> | null = null;

  return (partial) => {
    const now = Date.now();
    if (now - lastWrite < intervalMs) return;
    lastWrite = now;
    // Fire-and-forget; we don't await to keep the parser loop moving.
    pending = setProgress(uploadId, partial).catch(() => {
      // Ignore Redis failures — progress is advisory
    });
    void pending;
  };
}
