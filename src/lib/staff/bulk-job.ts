import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export type BulkJobStatus = "queued" | "running" | "done" | "failed";

export interface BulkJob {
  jobId: string;
  agentId: string;
  year: number;
  month: number;
  format: "csv" | "pdf";
  status: BulkJobStatus;
  /** Files generated so far */
  done: number;
  /** Total files to generate (set after the initial DB query) */
  total: number;
  /** R2 object key once the zip has been uploaded */
  r2Key?: string;
  /** Human-readable error when status === "failed" */
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const jobKey = (jobId: string) => `bulk-job:${jobId}`;
const activeSetKey = (agentId: string) => `bulk-job:active:${agentId}`;
const recentListKey = (agentId: string) => `bulk-job:recent:${agentId}`;
const TTL_SECONDS = 7200; // 2h for job records
export const RECENT_CAP = 20;
export const RECENT_RETURN_LIMIT = 10;

export async function createJob(
  data: Omit<BulkJob, "status" | "done" | "total" | "createdAt" | "updatedAt">,
): Promise<BulkJob> {
  const now = Date.now();
  const job: BulkJob = {
    ...data,
    status: "queued",
    done: 0,
    total: 0,
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
