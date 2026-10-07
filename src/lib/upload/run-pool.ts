/**
 * Bounded concurrent pool runner. Processes `items` through `worker` with
 * at most `concurrency` in-flight at once, preserving input order in the
 * returned array.
 *
 * `items` may be any iterable, including a generator: items are pulled one
 * at a time as workers free up, so a lazy source never has to be built in
 * full (confirm prices line items batch by batch this way).
 *
 * The canonical implementation — previously inlined in four places
 * (bulk-export-worker, payslip-bulk-worker, confirm, recalculate).
 */
export async function runPool<T, R>(
  items: Iterable<T>,
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const iterator = items[Symbol.iterator]();
  const results: R[] = [];
  let cursor = 0;
  let done = false;
  async function next(): Promise<void> {
    while (!done) {
      const step = iterator.next();
      if (step.done) {
        done = true;
        return;
      }
      const i = cursor++;
      results[i] = await worker(step.value, i);
    }
  }
  const runners = Array.from({ length: Math.max(1, concurrency) }, () => next());
  await Promise.all(runners);
  return results;
}
