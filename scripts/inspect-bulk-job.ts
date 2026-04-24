/**
 * Diagnostic: dump the latest failed bulk-job records so we can see the real
 * chunk-level error message. The Downloads Panel only shows the finalize
 * worker's wrapper ("All chunks failed — nothing to archive") — the real
 * root cause lives on the individual `chunk.error` fields.
 *
 * Usage: npx tsx scripts/inspect-bulk-job.ts [limit=5]
 */
import "dotenv/config";
import { Redis } from "@upstash/redis";

async function main() {
  const limit = Number(process.argv[2] ?? 5);

  const redis = Redis.fromEnv();

  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const res = (await redis.scan(cursor, { match: "bulk-job:*", count: 1000 })) as [
      string,
      string[],
    ];
    cursor = res[0];
    keys.push(...res[1]);
  } while (String(cursor) !== "0");

  // Only top-level job records (skip `:chunks`, `:done`, `:chunks-done`,
  // `active:*`, `recent:*`).
  const jobKeys = keys.filter(
    (k) =>
      !k.endsWith(":chunks") &&
      !k.endsWith(":done") &&
      !k.endsWith(":chunks-done") &&
      !k.startsWith("bulk-job:active:") &&
      !k.startsWith("bulk-job:recent:"),
  );

  const jobs = [];
  for (const k of jobKeys) {
    const job = await redis.get<Record<string, unknown>>(k);
    if (job) jobs.push(job);
  }

  // Failed first, then by updatedAt desc
  jobs.sort((a, b) => {
    const aFailed = a.status === "failed" ? 0 : 1;
    const bFailed = b.status === "failed" ? 0 : 1;
    if (aFailed !== bFailed) return aFailed - bFailed;
    return Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0);
  });

  for (const job of jobs.slice(0, limit)) {
    console.log("─".repeat(70));
    console.log(`jobId:   ${job.jobId}`);
    console.log(`status:  ${job.status}  stage: ${job.stage}`);
    console.log(`format:  ${job.format}  kind: ${job.kind ?? "month-detail"}`);
    console.log(`month:   ${job.year}-${job.month}`);
    console.log(`error:   ${job.error ?? "(none)"}`);
    console.log(`updated: ${new Date(Number(job.updatedAt)).toISOString()}`);
    const chunks = (job.chunks as Array<Record<string, unknown>> | undefined) ?? [];
    if (chunks.length) {
      const byStatus = new Map<string, number>();
      for (const c of chunks) {
        const s = String(c.status ?? "?");
        byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
      }
      const summary = [...byStatus.entries()].map(([s, n]) => `${s}=${n}`).join(" ");
      console.log(`chunks:  ${chunks.length} (${summary})`);
      const failed = chunks.filter((c) => c.status === "failed");
      for (const c of failed.slice(0, 3)) {
        console.log(`  chunk ${c.index}: ${c.error}`);
      }
      if (failed.length > 3) console.log(`  (+${failed.length - 3} more failed)`);
    }
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
