import { describe, it, expect } from "vitest";
import { runPool } from "../run-pool";

describe("runPool", () => {
  it("returns results in input order, regardless of completion order", async () => {
    const items = [1, 2, 3, 4, 5];
    // Reverse the latency so later items finish first
    const out = await runPool(items, 3, async (n) => {
      await new Promise((r) => setTimeout(r, (6 - n) * 10));
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("honours the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    await runPool(items, 3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns empty array for empty input without running any workers", async () => {
    let calls = 0;
    const out = await runPool<number, number>([], 4, async () => {
      calls++;
      return 0;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("propagates worker errors", async () => {
    await expect(
      runPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("passes the item index to the worker", async () => {
    const indices: number[] = [];
    await runPool(["a", "b", "c"], 1, async (_, i) => {
      indices.push(i);
      return null;
    });
    expect(indices).toEqual([0, 1, 2]);
  });
});
