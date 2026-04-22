/**
 * Phase 1 (red) tests for the Downloads Center Redis contract.
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md
 *
 * These tests exercise the additions to src/lib/staff/bulk-job.ts:
 *   - `updateJob` must LPUSH the jobId onto `bulk-job:recent:<agentId>` and
 *     LTRIM to RECENT_CAP when a job transitions to "done" or "failed".
 *   - `listRecent(agentId)` must return merged active + recent completed jobs,
 *     sorted by updatedAt desc, capped at RECENT_RETURN_LIMIT.
 *
 * Red expectations (Phase 1):
 *   - P2-T1: LPUSH + LTRIM are NOT called today → assertion fails.
 *   - P2-T2: listRecent is a stub that returns [] → filter assertion fails.
 *   - P2-T3: same — assertion on merged/sorted/capped output fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Upstash Redis client used by src/lib/staff/bulk-job.ts.
// `vi.hoisted` ensures the mock object is created before vi.mock hoists, so
// the factory can close over it without a ReferenceError.
const { mockRedis } = vi.hoisted(() => {
  return {
    mockRedis: {
      set: vi.fn(),
      get: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      smembers: vi.fn(),
      expire: vi.fn(),
      lpush: vi.fn(),
      ltrim: vi.fn(),
      lrange: vi.fn(),
      lrem: vi.fn(),
      del: vi.fn(),
    },
  };
});

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => mockRedis },
}));

// Import AFTER the mock is set up so bulk-job picks up the fake client.
import {
  RECENT_CAP,
  RECENT_RETURN_LIMIT,
  listRecent,
  updateJob,
  type BulkJob,
} from "../bulk-job";

function baseJob(partial: Partial<BulkJob> = {}): BulkJob {
  const now = Date.now();
  return {
    jobId: "job-1",
    agentId: "agent-1",
    year: 2026,
    month: 3,
    format: "csv",
    status: "running",
    stage: "generating",
    done: 0,
    total: 0,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

beforeEach(() => {
  for (const fn of Object.values(mockRedis)) {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateJob — transition to done/failed (P2-T1)", () => {
  it("LPUSHes the jobId onto bulk-job:recent:<agentId> and LTRIMs to RECENT_CAP when status becomes 'done'", async () => {
    const existing = baseJob({ status: "running" });
    mockRedis.get.mockResolvedValue(existing);

    await updateJob(existing.jobId, { status: "done" });

    expect(mockRedis.lpush).toHaveBeenCalledWith(
      `bulk-job:recent:${existing.agentId}`,
      existing.jobId,
    );
    expect(mockRedis.ltrim).toHaveBeenCalledWith(
      `bulk-job:recent:${existing.agentId}`,
      0,
      RECENT_CAP - 1,
    );
  });

  it("LPUSHes + LTRIMs when status becomes 'failed'", async () => {
    const existing = baseJob({ status: "running" });
    mockRedis.get.mockResolvedValue(existing);

    await updateJob(existing.jobId, { status: "failed", error: "boom" });

    expect(mockRedis.lpush).toHaveBeenCalledWith(
      `bulk-job:recent:${existing.agentId}`,
      existing.jobId,
    );
    expect(mockRedis.ltrim).toHaveBeenCalledWith(
      `bulk-job:recent:${existing.agentId}`,
      0,
      RECENT_CAP - 1,
    );
  });

  it("does NOT LPUSH while the job is still running", async () => {
    const existing = baseJob({ status: "running" });
    mockRedis.get.mockResolvedValue(existing);

    await updateJob(existing.jobId, { done: 5 });

    expect(mockRedis.lpush).not.toHaveBeenCalled();
  });
});

describe("listRecent — drop expired entries (P2-T2)", () => {
  it("filters out jobIds whose per-job record has TTL-expired", async () => {
    // Redis returns 3 jobIds in the recent list; only 2 of them still resolve
    // via GET (the third is gone — TTL expired).
    mockRedis.lrange.mockResolvedValue(["done-1", "expired-1", "done-2"]);
    mockRedis.smembers.mockResolvedValue([]);
    const now = Date.now();
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:done-1") {
        return baseJob({
          jobId: "done-1",
          status: "done",
          updatedAt: now - 1_000,
        });
      }
      if (key === "bulk-job:done-2") {
        return baseJob({
          jobId: "done-2",
          status: "done",
          updatedAt: now - 2_000,
        });
      }
      return null; // expired-1 has no record anymore
    });

    const result = await listRecent("agent-1");

    expect(result.map((j) => j.jobId)).toEqual(["done-1", "done-2"]);
    expect(result.length).toBe(2);
  });
});

describe("listRecent — merge active + completed, sorted desc, capped (P2-T3)", () => {
  it("returns active + recent merged, sorted by updatedAt desc, capped at RECENT_RETURN_LIMIT", async () => {
    const now = Date.now();
    // 2 running jobs in active set
    mockRedis.smembers.mockResolvedValue(["running-1", "running-2"]);
    // 12 completed jobs in recent list — newer to older
    const recentIds = Array.from({ length: 12 }, (_, i) => `done-${i + 1}`);
    mockRedis.lrange.mockResolvedValue(recentIds);

    const jobsById = new Map<string, BulkJob>();
    jobsById.set("running-1", baseJob({ jobId: "running-1", status: "running", updatedAt: now - 100 }));
    jobsById.set("running-2", baseJob({ jobId: "running-2", status: "running", updatedAt: now - 50 }));
    recentIds.forEach((id, i) => {
      jobsById.set(
        id,
        baseJob({ jobId: id, status: "done", updatedAt: now - (200 + i * 100) }),
      );
    });
    mockRedis.get.mockImplementation(async (key: string) => {
      const jobId = key.replace("bulk-job:", "");
      return jobsById.get(jobId) ?? null;
    });

    const result = await listRecent("agent-1");

    // Capped at the configured return limit
    expect(result.length).toBe(RECENT_RETURN_LIMIT);
    // Sorted by updatedAt desc — running-2 (newest) first
    expect(result[0].jobId).toBe("running-2");
    expect(result[1].jobId).toBe("running-1");
    // Then done jobs in updatedAt-desc order
    expect(result[2].jobId).toBe("done-1");
    // Monotonic updatedAt
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].updatedAt).toBeGreaterThanOrEqual(result[i].updatedAt);
    }
  });
});
