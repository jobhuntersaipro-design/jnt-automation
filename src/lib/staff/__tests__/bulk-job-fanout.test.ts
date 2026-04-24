/**
 * Tests for the fan-out-path correctness fixes from the PDF-cache audit:
 *   B1 — atomic done counter merged into BulkJob.done on read
 *   B4 — per-chunk hash overrides merged into BulkJob.chunks on read
 *
 * Spec: context/features/pdf-cache-spec.md
 * Audit: docs/audit-results/PDF_LINE_ITEMS_DOWNLOAD_AUDIT.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChunkState } from "../bulk-chunks";

const { mockRedis } = vi.hoisted(() => ({
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
    incr: vi.fn(),
    hset: vi.fn(),
    hget: vi.fn(),
    hgetall: vi.fn(),
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => mockRedis },
}));

import {
  getJob,
  incrementDoneCounter,
  patchChunk,
  seedChunksHash,
  type BulkJob,
} from "../bulk-job";

function fanoutJob(partial: Partial<BulkJob> = {}): BulkJob {
  const now = Date.now();
  const chunks: ChunkState[] = [
    { index: 0, dispatcherIds: ["d1", "d2"], status: "pending" },
    { index: 1, dispatcherIds: ["d3", "d4"], status: "pending" },
    { index: 2, dispatcherIds: ["d5", "d6"], status: "pending" },
  ];
  return {
    jobId: "job-fanout",
    agentId: "agent-1",
    year: 2026,
    month: 3,
    format: "pdf",
    status: "running",
    stage: "generating",
    done: 0,
    total: 6,
    totalChunks: chunks.length,
    completedChunks: 0,
    chunks,
    startedAt: now - 1_000,
    createdAt: now - 2_000,
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

describe("incrementDoneCounter — atomic INCR (audit B1)", () => {
  it("calls INCR on the per-job done counter key and sets TTL on first increment", async () => {
    mockRedis.incr.mockResolvedValue(1);

    const value = await incrementDoneCounter("job-fanout");

    expect(value).toBe(1);
    expect(mockRedis.incr).toHaveBeenCalledWith("bulk-job:job-fanout:done");
    expect(mockRedis.expire).toHaveBeenCalledWith(
      "bulk-job:job-fanout:done",
      60 * 60 * 24 * 30,
    );
  });

  it("does NOT re-apply TTL on subsequent increments", async () => {
    mockRedis.incr.mockResolvedValue(7);

    const value = await incrementDoneCounter("job-fanout");

    expect(value).toBe(7);
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });
});

describe("getJob — merges done counter into BulkJob.done (audit B1)", () => {
  it("overrides BulkJob.done with the counter value when it is greater", async () => {
    const job = fanoutJob({ done: 2 });
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:job-fanout") return job;
      if (key === "bulk-job:job-fanout:done") return 5;
      return null;
    });
    mockRedis.hgetall.mockResolvedValue(null);

    const merged = await getJob("job-fanout");

    expect(merged?.done).toBe(5);
  });

  it("keeps BulkJob.done when the counter has not been initialised yet", async () => {
    const job = fanoutJob({ done: 3 });
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:job-fanout") return job;
      return null;
    });
    mockRedis.hgetall.mockResolvedValue(null);

    const merged = await getJob("job-fanout");

    expect(merged?.done).toBe(3);
  });

  it("does NOT read the counter or chunks hash for inline-path jobs (totalChunks undefined)", async () => {
    const inline: BulkJob = {
      jobId: "inline-job",
      agentId: "agent-1",
      year: 2026,
      month: 3,
      format: "pdf",
      status: "running",
      stage: "generating",
      done: 4,
      total: 10,
      startedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mockRedis.get.mockResolvedValue(inline);

    const merged = await getJob("inline-job");

    expect(merged?.done).toBe(4);
    expect(mockRedis.hgetall).not.toHaveBeenCalled();
    // Only one GET — for the job record itself — not a second for the counter.
    expect(mockRedis.get).toHaveBeenCalledTimes(1);
  });
});

describe("getJob — merges per-chunk hash overrides (audit B4)", () => {
  it("replaces chunks[i] with the hash entry when present", async () => {
    const job = fanoutJob();
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:job-fanout") return job;
      return null;
    });
    mockRedis.hgetall.mockResolvedValue({
      "0": {
        index: 0,
        dispatcherIds: ["d1", "d2"],
        status: "done",
        r2Key: "part-0.zip",
        fileCount: 2,
      } satisfies ChunkState,
      "2": {
        index: 2,
        dispatcherIds: ["d5", "d6"],
        status: "failed",
        error: "timeout",
      } satisfies ChunkState,
    });

    const merged = await getJob("job-fanout");

    expect(merged?.chunks?.[0].status).toBe("done");
    expect(merged?.chunks?.[0].r2Key).toBe("part-0.zip");
    expect(merged?.chunks?.[1].status).toBe("pending");
    expect(merged?.chunks?.[2].status).toBe("failed");
    expect(merged?.completedChunks).toBe(2);
  });

  it("falls back to the on-record chunks array when the hash is empty", async () => {
    const job = fanoutJob();
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:job-fanout") return job;
      return null;
    });
    mockRedis.hgetall.mockResolvedValue({});

    const merged = await getJob("job-fanout");

    expect(merged?.chunks?.every((c) => c.status === "pending")).toBe(true);
  });
});

describe("patchChunk — writes to the hash (audit B4)", () => {
  it("HSETs just the target chunk's field without touching siblings", async () => {
    const job = fanoutJob();
    mockRedis.hget.mockResolvedValue(null); // hash not seeded yet
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === "bulk-job:job-fanout") return job;
      if (key === "bulk-job:job-fanout:done") return null;
      return null;
    });
    mockRedis.hgetall.mockResolvedValue({
      "1": {
        index: 1,
        dispatcherIds: ["d3", "d4"],
        status: "done",
        r2Key: "part-1.zip",
        fileCount: 2,
      } satisfies ChunkState,
    });

    await patchChunk("job-fanout", 1, { status: "running" });

    expect(mockRedis.hset).toHaveBeenCalledWith(
      "bulk-job:job-fanout:chunks",
      expect.objectContaining({
        "1": expect.objectContaining({ status: "running", index: 1 }),
      }),
    );
    // Only field "1" — not a full array write
    const hsetPayload = mockRedis.hset.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(hsetPayload)).toEqual(["1"]);
  });
});

describe("seedChunksHash — initial fan-out seed", () => {
  it("HSETs every chunk field and applies TTL once", async () => {
    const chunks: ChunkState[] = [
      { index: 0, dispatcherIds: ["a"], status: "pending" },
      { index: 1, dispatcherIds: ["b"], status: "pending" },
    ];

    await seedChunksHash("job-fanout", chunks);

    expect(mockRedis.hset).toHaveBeenCalledWith(
      "bulk-job:job-fanout:chunks",
      { "0": chunks[0], "1": chunks[1] },
    );
    expect(mockRedis.expire).toHaveBeenCalledWith(
      "bulk-job:job-fanout:chunks",
      60 * 60 * 24 * 30,
    );
  });

  it("no-ops for empty chunks array", async () => {
    await seedChunksHash("job-fanout", []);

    expect(mockRedis.hset).not.toHaveBeenCalled();
  });
});
