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
const TTL_SECONDS = 7200; // 2h for job records

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
  const next: BulkJob = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await redis.set(jobKey(jobId), next, { ex: TTL_SECONDS });
  // Remove from active set once the job is no longer running
  if (next.status === "done" || next.status === "failed") {
    await redis.srem(activeSetKey(next.agentId), jobId);
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
