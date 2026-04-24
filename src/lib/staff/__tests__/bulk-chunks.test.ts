import { describe, it, expect } from "vitest";
import {
  splitDispatchers,
  countDoneChunks,
  partR2Key,
  DEFAULT_CHUNK_SIZE,
  type ChunkState,
} from "../bulk-chunks";

describe("splitDispatchers", () => {
  it("empty input → empty array", () => {
    expect(splitDispatchers([])).toEqual([]);
  });

  it("exactly chunkSize → one full chunk", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `d${i}`);
    const chunks = splitDispatchers(ids, 15);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].dispatcherIds).toHaveLength(15);
    expect(chunks[0].status).toBe("pending");
    expect(chunks[0].index).toBe(0);
  });

  it("N+1 items → two chunks, second has 1", () => {
    const ids = Array.from({ length: 16 }, (_, i) => `d${i}`);
    const chunks = splitDispatchers(ids, 15);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].dispatcherIds).toHaveLength(15);
    expect(chunks[1].dispatcherIds).toEqual(["d15"]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("preserves order", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const chunks = splitDispatchers(ids, 2);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].dispatcherIds).toEqual(["a", "b"]);
    expect(chunks[1].dispatcherIds).toEqual(["c", "d"]);
    expect(chunks[2].dispatcherIds).toEqual(["e"]);
  });

  it("rejects non-positive chunkSize", () => {
    expect(() => splitDispatchers(["a"], 0)).toThrow("chunkSize must be > 0");
    expect(() => splitDispatchers(["a"], -1)).toThrow("chunkSize must be > 0");
  });

  it("defaults to DEFAULT_CHUNK_SIZE", () => {
    const ids = Array.from({ length: DEFAULT_CHUNK_SIZE + 1 }, (_, i) => `d${i}`);
    const chunks = splitDispatchers(ids);
    expect(chunks).toHaveLength(2);
  });
});

describe("countDoneChunks", () => {
  it("returns only the `done` count (ignores failed)", () => {
    const chunks: ChunkState[] = [
      { index: 0, dispatcherIds: [], status: "done" },
      { index: 1, dispatcherIds: [], status: "failed" },
      { index: 2, dispatcherIds: [], status: "done" },
      { index: 3, dispatcherIds: [], status: "running" },
    ];
    expect(countDoneChunks(chunks)).toBe(2);
  });
});

describe("partR2Key", () => {
  it("uses agentId + jobId + chunk index", () => {
    expect(partR2Key({ agentId: "agentX", jobId: "jobY" }, 3)).toBe(
      "bulk-exports/agentX/jobY/parts/3.zip",
    );
  });
});
