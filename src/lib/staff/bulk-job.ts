import { Redis } from "@upstash/redis";
import type { ChunkState } from "./bulk-chunks";

const redis = Redis.fromEnv();

export type BulkJobStatus = "queued" | "running" | "done" | "failed";

/**
 * Fine-grained stage during a running job. Drives the downloads-panel label
 * ("Fetching records…" vs. "Bundling zip…") so a long job doesn't feel stuck
 * on a single counter.
 */
export type BulkJobStage =
  | "queued"
  | "fetching"
  | "generating"
  | "zipping"
  | "uploading"
  | "done";

/**
 * What the job is generating. `month-detail` is the original flow —
 * parcel-level CSV/PDF for every dispatcher in a given month. `payslip`
 * generates per-dispatcher payslip PDFs (pinned to a specific upload +
 * subset of dispatchers) and hands back a zip.
 */
export type BulkJobKind = "month-detail" | "payslip";

export interface BulkJob {
  jobId: string;
  agentId: string;
  year: number;
  month: number;
  format: "csv" | "pdf";
  /** Default "month-detail" for backward compat with pre-Phase-3 records. */
  kind?: BulkJobKind;
  /** Payslip jobs only: the upload these payslips belong to. */
  uploadId?: string;
  /** Payslip jobs only: the specific dispatchers to generate for. */
  dispatcherIds?: string[];
  /** Payslip jobs only: branch code — used for the zip filename. */
  branchCode?: string;
  status: BulkJobStatus;
  stage: BulkJobStage;
  /** Files generated so far */
  done: number;
  /** Total files to generate (set after the initial DB query) */
  total: number;
  /**
   * Display label for the file currently being generated (e.g. dispatcher
   * or employee name). Updated per-file during the `generating` stage so
   * the Downloads Panel can show `Generating Ahmad Bin Hamid · 15 / 47`
   * instead of just a raw counter.
   */
  currentLabel?: string;
  /** Wall-clock start of actual work (fetching onwards). Null while queued. */
  startedAt: number | null;
  /** R2 object key once the zip has been uploaded */
  r2Key?: string;
  /**
   * QStash fan-out state (Phase 3b). Populated only when the month-detail
   * job was dispatched in prod; dev path keeps the inline single-worker flow
   * and leaves these undefined.
   */
  totalChunks?: number;
  completedChunks?: number;
  chunks?: ChunkState[];
  /** Human-readable error when status === "failed" */
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobKey = (jobId: string) => `bulk-job:${jobId}`;
const activeSetKey = (agentId: string) => `bulk-job:active:${agentId}`;
const recentListKey = (agentId: string) => `bulk-job:recent:${agentId}`;
// 30 days — paired with an R2 lifecycle rule on the `bulk-exports/` prefix so
// Redis pointer and R2 object expire together (see docs/perf/r2-lifecycle.md).
// Previously 2h, which produced "pointer gone, blob orphaned" errors whenever
// a user tried to re-download an export from the Downloads Center the next day.
const TTL_SECONDS = 60 * 60 * 24 * 30;
export const RECENT_CAP = 50;
export const RECENT_RETURN_LIMIT = 10;

export async function createJob(
  data: Omit<
    BulkJob,
    "status" | "stage" | "done" | "total" | "startedAt" | "createdAt" | "updatedAt"
  >,
): Promise<BulkJob> {
  const now = Date.now();
  const job: BulkJob = {
    ...data,
    kind: data.kind ?? "month-detail",
    status: "queued",
    stage: "queued",
    done: 0,
    total: 0,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await redis.set(jobKey(job.jobId), job, { ex: TTL_SECONDS });
  await redis.sadd(activeSetKey(job.agentId), job.jobId);
  await redis.expire(activeSetKey(job.agentId), TTL_SECONDS);
  return job;
}

export async function getJob(jobId: string): Promise<BulkJob | null> {
  return redis.get<BulkJob>(jobKey(jobId));
}

export async function updateJob(
  jobId: string,
  patch: Partial<Omit<BulkJob, "jobId" | "agentId" | "createdAt">>,
): Promise<void> {
  const existing = await getJob(jobId);
  if (!existing) return;
  const wasTerminal = existing.status === "done" || existing.status === "failed";
  const next: BulkJob = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await redis.set(jobKey(jobId), next, { ex: TTL_SECONDS });

  if (next.status === "done" || next.status === "failed") {
    await redis.srem(activeSetKey(next.agentId), jobId);
    // Only add to recent on the transition — re-applying terminal state
    // (e.g. repeated status writes) must not duplicate list entries.
    if (!wasTerminal) {
      await redis.lpush(recentListKey(next.agentId), jobId);
      await redis.ltrim(recentListKey(next.agentId), 0, RECENT_CAP - 1);
      await redis.expire(recentListKey(next.agentId), TTL_SECONDS);
    }
  }
}

/**
 * Atomically patch a single chunk's state. Multiple fan-out workers write
 * to the same job record concurrently; a naive read-modify-write in
 * `updateJob` would clobber sibling writes. This helper reloads inside a
 * short retry loop and CAS-compares `updatedAt` to detect races. Upstash
 * doesn't expose MULTI/EXEC, so retry-on-conflict is the pragmatic path.
 *
 * Returns the full post-update job (useful for the caller to check
 * `allChunksTerminal` and decide whether to publish finalize).
 */
export async function patchChunk(
  jobId: string,
  chunkIndex: number,
  patch: Partial<ChunkState>,
): Promise<BulkJob | null> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await getJob(jobId);
    if (!existing || !existing.chunks) return null;
    const prior = existing.chunks[chunkIndex];
    if (!prior) return null;

    const nextChunks = [...existing.chunks];
    nextChunks[chunkIndex] = { ...prior, ...patch };
    const completedChunks = nextChunks.filter(
      (c) => c.status === "done" || c.status === "failed",
    ).length;

    const priorUpdatedAt = existing.updatedAt;
    const next: BulkJob = {
      ...existing,
      chunks: nextChunks,
      completedChunks,
      updatedAt: Date.now(),
    };

    // Short-window CAS: re-read, bail out + retry if another writer bumped
    // updatedAt between our read and write.
    const latest = await getJob(jobId);
    if (!latest || latest.updatedAt !== priorUpdatedAt) {
      // concurrent writer raced us — retry
      continue;
    }

    await redis.set(jobKey(jobId), next, { ex: TTL_SECONDS });
    return next;
  }
  // All attempts contended. The caller will see the latest state on next
  // read — the terminal transition still happens, just via another writer.
  return getJob(jobId);
}

/**
 * List all jobs currently queued/running for an agent. Used by the
 * notification icon indicator to show a progress ring while work is in
 * flight.
 */
export async function listActiveJobs(agentId: string): Promise<BulkJob[]> {
  const ids = await redis.smembers(activeSetKey(agentId));
  if (ids.length === 0) return [];
  const jobs: BulkJob[] = [];
  for (const id of ids) {
    const job = await getJob(id);
    if (!job) {
      // Job expired — remove stale entry from set
      await redis.srem(activeSetKey(agentId), id);
      continue;
    }
    if (job.status === "done" || job.status === "failed") {
      // Safety net: caller can still fetch job by id, but shouldn't block the bell
      await redis.srem(activeSetKey(agentId), id);
      continue;
    }
    jobs.push(job);
  }
  return jobs;
}

/**
 * Returns the agent's merged active + recently completed jobs, sorted by
 * `updatedAt` desc, capped at RECENT_RETURN_LIMIT. Used by the Downloads
 * Center panel on the notification bell.
 *
 * Expired jobs (per-job TTL hit) are lazily swept from both the active set
 * and the recent list so callers never see dangling IDs.
 */
export async function listRecent(agentId: string): Promise<BulkJob[]> {
  const [activeIds, recentIds] = await Promise.all([
    redis.smembers(activeSetKey(agentId)),
    redis.lrange(recentListKey(agentId), 0, RECENT_CAP - 1),
  ]);

  // Deduplicate — a job may appear in both while the LPUSH races the
  // active-set removal. Keep the active-set ordering priority.
  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const id of [...activeIds, ...(recentIds as string[])]) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }

  const jobs: BulkJob[] = [];
  for (const id of orderedIds) {
    const job = await getJob(id);
    if (!job) {
      // TTL expired — sweep from both collections
      await redis.srem(activeSetKey(agentId), id);
      await redis.lrem(recentListKey(agentId), 0, id);
      continue;
    }
    jobs.push(job);
  }

  jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  return jobs.slice(0, RECENT_RETURN_LIMIT);
}

/**
 * Hard-clear the recent list for an agent (does not touch in-flight jobs).
 * Backs the DELETE /api/dispatchers/month-detail/bulk/recent endpoint.
 */
export async function clearRecent(agentId: string): Promise<void> {
  await redis.del(recentListKey(agentId));
}
