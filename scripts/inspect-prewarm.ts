/**
 * Diagnostic for the prewarm-job Redis keys that drive the Payroll page's
 * "Preparing…" indicator. Lists every active prewarm with done/total +
 * stage + error so you can see which months are stuck.
 *
 * With `--reset <agentId> <year> <month>`: overwrite a stuck state to
 * `{ status: "done", stage: "done" }` so the UI clears. Use only when you
 * know the underlying cache is actually complete (or intentionally
 * giving up on a prewarm). Does NOT touch cache blobs.
 *
 * Usage:
 *   npx tsx scripts/inspect-prewarm.ts
 *   npx tsx scripts/inspect-prewarm.ts --reset <agentId> 2026 2
 */
import "dotenv/config";
import { Redis } from "@upstash/redis";

interface PrewarmState {
  agentId: string;
  year: number;
  month: number;
  status: "queued" | "running" | "done" | "failed";
  stage?: "queued" | "generating" | "finalizing" | "done";
  total: number;
  done: number;
  totalChunks: number;
  doneChunks: number;
  reason: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

async function main() {
  const redis = Redis.fromEnv();
  const args = process.argv.slice(2);

  if (args[0] === "--reset") {
    const [_, agentId, yearStr, monthStr] = args;
    if (!agentId || !yearStr || !monthStr) {
      console.error("Usage: --reset <agentId> <year> <month>");
      process.exit(1);
    }
    const year = Number(yearStr);
    const month = Number(monthStr);
    const mm = String(month).padStart(2, "0");
    const key = `prewarm:state:${agentId}:${year}-${mm}`;
    const state = await redis.get<PrewarmState>(key);
    if (!state) {
      console.log(`${key}: NOT FOUND`);
      return;
    }
    await redis.set(
      key,
      { ...state, status: "done", stage: "done", updatedAt: Date.now() },
      { ex: 60 * 60 * 24 * 30 },
    );
    // Also reset the atomic done counter so a re-run doesn't pre-bump.
    await redis.del(`${key}:done`);
    await redis.del(`${key}:done-chunks`);
    console.log(`${key}: reset to status=done`);
    return;
  }

  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const res = (await redis.scan(cursor, {
      match: "prewarm:state:*",
      count: 1000,
    })) as [string, string[]];
    cursor = res[0];
    keys.push(...res[1]);
  } while (String(cursor) !== "0");

  const stateKeys = keys.filter(
    (k) => !k.endsWith(":done") && !k.endsWith(":done-chunks"),
  );

  const states: PrewarmState[] = [];
  for (const k of stateKeys) {
    const s = await redis.get<PrewarmState>(k);
    if (s) states.push(s);
  }

  states.sort((a, b) => b.updatedAt - a.updatedAt);

  for (const s of states) {
    console.log("─".repeat(70));
    console.log(`agent:   ${s.agentId}`);
    console.log(`month:   ${s.year}-${String(s.month).padStart(2, "0")}`);
    console.log(`status:  ${s.status}  stage: ${s.stage ?? "(none)"}`);
    console.log(`progress: ${s.done}/${s.total}  chunks: ${s.doneChunks}/${s.totalChunks}`);
    console.log(`reason:  ${s.reason}`);
    console.log(`updated: ${new Date(s.updatedAt).toISOString()}`);
    if (s.error) console.log(`error:   ${s.error}`);
  }

  if (states.length === 0) console.log("(no prewarm state in Redis)");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
