import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getJob } from "@/lib/staff/bulk-job";
import { hasCached, zipKey } from "@/lib/staff/pdf-cache";

const redis = Redis.fromEnv();

/**
 * GET /api/dispatchers/month-detail/bulk/[jobId]/debug
 *
 * Diagnostic dump for a stuck bulk export. Returns:
 *   - Full Redis job record (all fields, not just the trimmed status route)
 *   - Whether the jobId is still in the agent's active set
 *   - Whether the chunks-done / done counters exist (fan-out only)
 *   - Whether the canonical cache zip exists in R2
 *   - Wall-clock age of the record
 *
 * If the spinner won't go away, hit this endpoint with the jobId from the
 * Network tab on `/bulk/start` — the response tells you exactly which stage
 * the worker stalled on (or if the record disappeared from Redis entirely).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job || job.agentId !== effective.agentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activeKey = `bulk-job:active:${effective.agentId}`;
  const recentKey = `bulk-job:recent:${effective.agentId}`;
  const doneCounterKey = `bulk-job:${jobId}:done`;
  const chunksDoneKey = `bulk-job:${jobId}:chunks-done`;
  const chunksHashKey = `bulk-job:${jobId}:chunks`;

  const [inActiveSet, inRecentList, doneCounter, chunksDoneCounter, chunksHash] =
    await Promise.all([
      redis.sismember(activeKey, jobId),
      redis
        .lrange(recentKey, 0, 50)
        .then((ids: string[]) => ids.includes(jobId)),
      redis.get<number>(doneCounterKey),
      redis.get<number>(chunksDoneKey),
      redis.hgetall(chunksHashKey),
    ]);

  const cacheKey = zipKey(job.agentId, job.year, job.month, job.format);
  const cacheExists = await hasCached(cacheKey).catch((err) => ({
    error: err instanceof Error ? err.message : String(err),
  }));

  const now = Date.now();
  return NextResponse.json({
    jobId: job.jobId,
    diagnostics: {
      ageSeconds: Math.round((now - job.createdAt) / 1000),
      sinceLastUpdateSeconds: Math.round((now - job.updatedAt) / 1000),
      sinceStartedSeconds: job.startedAt
        ? Math.round((now - job.startedAt) / 1000)
        : null,
      inActiveSet: Boolean(inActiveSet),
      inRecentList,
    },
    job: {
      status: job.status,
      stage: job.stage,
      kind: job.kind,
      format: job.format,
      year: job.year,
      month: job.month,
      done: job.done,
      total: job.total,
      currentLabel: job.currentLabel,
      error: job.error,
      r2Key: job.r2Key,
      totalChunks: job.totalChunks,
      completedChunks: job.completedChunks,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
    },
    counters: {
      done: doneCounter,
      chunksDone: chunksDoneCounter,
      chunkHashSize:
        chunksHash && typeof chunksHash === "object"
          ? Object.keys(chunksHash).length
          : 0,
    },
    chunks: job.chunks?.map((c, i) => ({
      index: i,
      status: c.status,
      fileCount: c.fileCount,
      r2Key: c.r2Key,
      error: c.error,
      dispatcherCount: c.dispatcherIds?.length,
    })),
    cache: {
      key: cacheKey,
      exists: cacheExists,
    },
    redisKeys: {
      job: `bulk-job:${jobId}`,
      activeSet: activeKey,
      recentList: recentKey,
      doneCounter: doneCounterKey,
      chunksDoneCounter: chunksDoneKey,
      chunksHash: chunksHashKey,
    },
  });
}
