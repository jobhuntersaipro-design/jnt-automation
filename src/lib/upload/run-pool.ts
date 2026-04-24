/**
 * Bounded concurrent pool runner. Processes `items` through `worker` with
 * at most `concurrency` in-flight at once, preserving input order in the
 * returned array.
 *
 * The canonical implementation — previously inlined in four places
 * (bulk-export-worker, payslip-bulk-worker, confirm, recalculate).
 */
export async function runPool<T, R>(
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
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  await Promise.all(runners);
  return results;
}
