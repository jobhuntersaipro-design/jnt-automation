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
/**
 * Atomic counter used by the QStash fan-out to decide which chunk worker
 * should publish the finalize message. INCR is atomic on Redis — exactly
 * one chunk will see the return value equal to totalChunks.
 */
const chunksDoneCounterKey = (jobId: string) => `bulk-job:${jobId}:chunks-done`;
/**
 * Atomic counter for files completed across all chunk workers. Read by
 * `getJob` and merged into `BulkJob.done`. Replaces a read-modify-write
 * pattern on the job record which silently lost increments under the
 * fan-out path (audit B1).
 */
const doneCounterKey = (jobId: string) => `bulk-job:${jobId}:done`;
/**
 * Per-chunk hash. Each chunk writes to its own field via `HSET` so
 * concurrent chunk finishers never overwrite each other's status / r2Key
 * (audit B4). The initial chunks array is mirrored here in
 * `startBulkExportFanout`; updates go here exclusively.
 */
const chunksHashKey = (jobId: string) => `bulk-job:${jobId}:chunks`;
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
  const job = await redis.get<BulkJob>(jobKey(jobId));
  if (!job) return null;

  // Fan-out jobs have `totalChunks` set and use the atomic done counter
  // (audit B1) + per-chunk hash (audit B4). Inline jobs write `done`
  // directly on the record and don't pay the extra Redis reads.
  if (!job.totalChunks) return job;

  const [counter, chunksHash] = await Promise.all([
    redis.get<number>(doneCounterKey(jobId)),
    redis.hgetall<Record<string, ChunkState>>(chunksHashKey(jobId)),
  ]);

  let merged = job;
  if (typeof counter === "number") {
    merged = { ...merged, done: Math.max(merged.done, counter) };
  }
  if (chunksHash && job.chunks) {
    const nextChunks = job.chunks.map((c, i) => chunksHash[String(i)] ?? c);
    const completedChunks = nextChunks.filter(
      (c) => c.status === "done" || c.status === "failed",
    ).length;
    merged = { ...merged, chunks: nextChunks, completedChunks };
  }
  return merged;
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
 * Patch a single chunk's state.
 *
 * Writes land on a dedicated hash field (`HSET chunks:{jobId} {i} …`) so
 * concurrent chunk finishers never overwrite each other's rows (audit B4).
 * `getJob` merges the hash back into `BulkJob.chunks` on read.
 *
 * Returns the post-write job snapshot (for progress UI).
 */
export async function patchChunk(
  jobId: string,
  chunkIndex: number,
  patch: Partial<ChunkState>,
): Promise<BulkJob | null> {
  const hashKey = chunksHashKey(jobId);
  // Prior state comes from the hash first (latest write), then falls back
  // to the initial array written by startBulkExportFanout.
  const priorFromHash = await redis.hget<ChunkState>(hashKey, String(chunkIndex));
  let prior = priorFromHash;
  if (!prior) {
    const job = await redis.get<BulkJob>(jobKey(jobId));
    prior = job?.chunks?.[chunkIndex] ?? null;
  }
  if (!prior) return null;

  const next = { ...prior, ...patch };
  await redis.hset(hashKey, { [String(chunkIndex)]: next });
  await redis.expire(hashKey, TTL_SECONDS);

  // Bump updatedAt on the job record so the progress UI ticks. No other
  // field is touched here — chunk state lives in the hash.
  const jobRecord = await redis.get<BulkJob>(jobKey(jobId));
  if (jobRecord) {
    await redis.set(
      jobKey(jobId),
      { ...jobRecord, updatedAt: Date.now() },
      { ex: TTL_SECONDS },
    );
  }

  return getJob(jobId);
}

/**
 * Seed the per-chunk hash with the initial array. Called once by
 * `startBulkExportFanout` after splitting. Keeps the chunks array on the
 * job record for historical compatibility and as the fallback for
 * `patchChunk` when a chunk finishes before the hash is populated.
 */
export async function seedChunksHash(
  jobId: string,
  chunks: ChunkState[],
): Promise<void> {
  if (chunks.length === 0) return;
  const payload: Record<string, ChunkState> = {};
  for (const c of chunks) payload[String(c.index)] = c;
  const hashKey = chunksHashKey(jobId);
  await redis.hset(hashKey, payload);
  await redis.expire(hashKey, TTL_SECONDS);
}

/**
 * Atomically increment and return the per-job "files done" counter for the
 * fan-out path. Replaces a read-modify-write on `BulkJob.done` which lost
 * increments under concurrent chunk workers (audit B1).
 *
 * `getJob` merges this counter into `BulkJob.done` so callers never have
 * to read it directly.
 */
export async function incrementDoneCounter(jobId: string): Promise<number> {
  const key = doneCounterKey(jobId);
  const value = await redis.incr(key);
  if (value === 1) await redis.expire(key, TTL_SECONDS);
  return value;
}

/**
 * Atomically increment and return the "chunks-done" counter for this job.
 * Exactly one caller observes the return value equal to `totalChunks` —
 * that caller is responsible for publishing the finalize message.
 * Upstash INCR is atomic, unlike read-modify-write on the job record.
 */
export async function incrementChunksDone(jobId: string): Promise<number> {
  const key = chunksDoneCounterKey(jobId);
  const value = await redis.incr(key);
  // Only set expiry on first increment; avoids bumping the TTL on every
  // chunk finish. Upstash doesn't expose SET + NX in the same call as
  // INCR, so this is the cheapest pattern.
  if (value === 1) {
    await redis.expire(key, TTL_SECONDS);
  }
  return value;
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

  const activeSet = new Set(activeIds);
  const recentSet = new Set(recentIds as string[]);

  const jobs: BulkJob[] = [];
  for (const id of orderedIds) {
    const job = await getJob(id);
    if (!job) {
      // TTL expired — sweep from both collections
      await redis.srem(activeSetKey(agentId), id);
      await redis.lrem(recentListKey(agentId), 0, id);
      continue;
    }
    // Terminal jobs should never stay in the active set — they do when a
    // transition-time SREM was lost (transient Redis error, worker killed
    // mid-updateJob, or a direct `redis.set` path that bypassed updateJob).
    // Sweep them into the recent list so `clearRecent` can actually evict
    // them; otherwise Clear all has no visible effect on those rows.
    if (
      (job.status === "done" || job.status === "failed") &&
      activeSet.has(id)
    ) {
      await redis.srem(activeSetKey(agentId), id);
      if (!recentSet.has(id)) {
        await redis.lpush(recentListKey(agentId), id);
        await redis.ltrim(recentListKey(agentId), 0, RECENT_CAP - 1);
        await redis.expire(recentListKey(agentId), TTL_SECONDS);
      }
    }
    jobs.push(job);
  }

  jobs.sort((a, b) => b.updatedAt - a.updatedAt);
  return jobs.slice(0, RECENT_RETURN_LIMIT);
}

/**
 * Hard-clear the recent list for an agent. Also sweeps any terminal job
 * that leaked into the active set — otherwise those rows re-appear on the
 * next poll and the UI looks like Clear all did nothing. Genuinely running
 * jobs stay, so in-flight work is untouched.
 *
 * Backs the DELETE /api/dispatchers/month-detail/bulk/recent endpoint.
 */
export async function clearRecent(agentId: string): Promise<void> {
  const activeIds = await redis.smembers(activeSetKey(agentId));
  const toRemove: string[] = [];
  for (const id of activeIds) {
    const job = await redis.get<BulkJob>(jobKey(id));
    // Missing record (TTL) or terminal → safe to drop from the active set.
    if (!job || job.status === "done" || job.status === "failed") {
      toRemove.push(id);
    }
  }
  if (toRemove.length > 0) {
    await redis.srem(activeSetKey(agentId), ...toRemove);
  }
  await redis.del(recentListKey(agentId));
}
