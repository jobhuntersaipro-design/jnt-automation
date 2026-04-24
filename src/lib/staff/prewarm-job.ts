import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

/**
 * Redis state for a per-(agent, year, month) prewarm run. One record per
 * month; overwritten when a new prewarm starts (e.g. after recalculate).
 *
 * Status lifecycle:
 *   queued → running → done | failed
 *
 * The `done` counter is updated atomically by chunk workers via
 * `incrementPrewarmDone`. `total` is set once by the fan-out dispatcher.
 *
 * The UI polls `/api/payroll-cache/status` which returns this state so the
 * Payroll page can show "Preparing downloads — 47 / 100" per month and
 * disable the PDF buttons until done.
 */
export type PrewarmStatus = "queued" | "running" | "done" | "failed";

export interface PrewarmState {
  agentId: string;
  year: number;
  month: number;
  status: PrewarmStatus;
  total: number;
  done: number;
  totalChunks: number;
  doneChunks: number;
  /** Free-form label — e.g. `upload-confirmed` / `recalculate` / `manual` */
  reason: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

// 30 days — paired with the R2 lifecycle rule for payroll-cache blobs.
// Stale state sweeps itself out instead of lingering forever.
const TTL_SECONDS = 60 * 60 * 24 * 30;

function stateKey(agentId: string, year: number, month: number): string {
  return `prewarm:state:${agentId}:${year}-${String(month).padStart(2, "0")}`;
}

function doneCounterKey(agentId: string, year: number, month: number): string {
  return `prewarm:state:${agentId}:${year}-${String(month).padStart(2, "0")}:done`;
}

function doneChunksCounterKey(
  agentId: string,
  year: number,
  month: number,
): string {
  return `prewarm:state:${agentId}:${year}-${String(month).padStart(2, "0")}:done-chunks`;
}

export async function createPrewarmJob(
  args: Pick<
    PrewarmState,
    "agentId" | "year" | "month" | "total" | "totalChunks" | "reason"
  >,
): Promise<PrewarmState> {
  const now = Date.now();
  const state: PrewarmState = {
    ...args,
    status: "queued",
    done: 0,
    doneChunks: 0,
    startedAt: now,
    updatedAt: now,
  };
  await redis.set(stateKey(args.agentId, args.year, args.month), state, {
    ex: TTL_SECONDS,
  });
  // Reset counters. `del` is safe even when the key doesn't exist.
  await redis.del(doneCounterKey(args.agentId, args.year, args.month));
  await redis.del(doneChunksCounterKey(args.agentId, args.year, args.month));
  return state;
}

export async function getPrewarmJob(
  agentId: string,
  year: number,
  month: number,
): Promise<PrewarmState | null> {
  const base = await redis.get<PrewarmState>(stateKey(agentId, year, month));
  if (!base) return null;

  // Merge live counters so UI progress is monotonic even between
  // `updatePrewarmJob` calls — fan-out chunk workers INCR the counter
  // directly without touching the top-level record on every file.
  const [done, doneChunks] = await Promise.all([
    redis.get<number>(doneCounterKey(agentId, year, month)),
    redis.get<number>(doneChunksCounterKey(agentId, year, month)),
  ]);

  return {
    ...base,
    done: Math.max(base.done, done ?? 0),
    doneChunks: Math.max(base.doneChunks, doneChunks ?? 0),
  };
}

export async function updatePrewarmJob(
  agentId: string,
  year: number,
  month: number,
  patch: Partial<Omit<PrewarmState, "agentId" | "year" | "month" | "startedAt">>,
): Promise<void> {
  const existing = await redis.get<PrewarmState>(
    stateKey(agentId, year, month),
  );
  if (!existing) return;
  const next: PrewarmState = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await redis.set(stateKey(agentId, year, month), next, { ex: TTL_SECONDS });
}

/**
 * Atomic per-file counter. Fan-out chunk workers INCR this instead of
 * read-modify-write on the state record — avoids losing increments under
 * concurrent chunk completion.
 */
export async function incrementPrewarmDone(
  agentId: string,
  year: number,
  month: number,
  by: number = 1,
): Promise<number> {
  const key = doneCounterKey(agentId, year, month);
  const value = await redis.incrby(key, by);
  if (value === by) await redis.expire(key, TTL_SECONDS);
  return value;
}

/**
 * Atomic chunks-done counter. Exactly one chunk worker observes the return
 * value equal to `totalChunks` — that worker is responsible for publishing
 * the finalize message.
 */
export async function incrementPrewarmDoneChunks(
  agentId: string,
  year: number,
  month: number,
): Promise<number> {
  const key = doneChunksCounterKey(agentId, year, month);
  const value = await redis.incr(key);
  if (value === 1) await redis.expire(key, TTL_SECONDS);
  return value;
}
