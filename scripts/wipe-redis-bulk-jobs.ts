/**
 * Admin ops script: SCAN + DEL every `bulk-job:*` key in Upstash Redis.
 *
 * Covers per-job records (`bulk-job:<jobId>`), per-agent index sets
 * (`bulk-job:active:<agentId>`, `bulk-job:recent:<agentId>`), and the
 * fan-out auxiliary keys (`bulk-job:<jobId>:chunks`, `:done`, `:chunks-done`).
 *
 * Default is dry-run. Add `--confirm` to execute.
 *
 * Usage:
 *   npx tsx scripts/wipe-redis-bulk-jobs.ts
 *   npx tsx scripts/wipe-redis-bulk-jobs.ts --confirm
 */
import "dotenv/config";
import { Redis } from "@upstash/redis";

const PATTERN = "bulk-job:*";

async function main() {
  const confirm = process.argv.includes("--confirm");

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in env.",
    );
    process.exit(1);
  }

  const redis = Redis.fromEnv();

  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const res = (await redis.scan(cursor, { match: PATTERN, count: 1000 })) as [
      string,
      string[],
    ];
    cursor = res[0];
    keys.push(...res[1]);
  } while (String(cursor) !== "0");

  console.log(`Pattern: ${PATTERN}`);
  console.log(`Matched: ${keys.length} key(s)`);
  if (keys.length > 0 && keys.length <= 20) {
    for (const k of keys) console.log(`  ${k}`);
  } else if (keys.length > 20) {
    for (const k of keys.slice(0, 10)) console.log(`  ${k}`);
    console.log(`  ... and ${keys.length - 10} more`);
  }

  if (!confirm) {
    console.log("");
    console.log("Dry-run — no writes performed. Add --confirm to delete.");
    return;
  }

  if (keys.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Upstash DEL accepts a varargs list — batch in 500s to stay comfortably
  // under any per-request size limits.
  const batchSize = 500;
  let deleted = 0;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const n = await redis.del(...batch);
    deleted += n;
  }
  console.log(`Deleted: ${deleted} key(s)`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
