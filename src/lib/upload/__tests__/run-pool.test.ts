import { describe, it, expect } from "vitest";

/**
 * Local copy of runPool for unit testing. Kept in sync with the version
 * in src/app/api/upload/[uploadId]/confirm/route.ts — if the route version
 * ever gets extracted to a shared module, delete this copy and import.
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

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
