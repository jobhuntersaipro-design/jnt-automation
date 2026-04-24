import type { BulkJob, BulkJobStage } from "./bulk-job";

/**
 * How much of the total wall-clock each stage contributes to the progress
 * bar. Tuned from observed real-world bulk exports:
 *   - fetching:   ~5%  (2 Prisma round-trips)
 *   - generating: ~70% (CPU-bound PDF/CSV per dispatcher, dominant)
 *   - zipping:    ~15% (JSZip/archiver buffer or stream build)
 *   - uploading:  ~10% (R2 PutObject / multipart upload)
 *
 * Must sum to 1. Without weighting the bar stalled at 100% during the
 * last two stages for ~20% of total job time on large jobs.
 */
export const STAGE_WEIGHTS: Record<BulkJobStage, number> = {
  queued: 0,
  fetching: 0.05,
  generating: 0.7,
  zipping: 0.15,
  uploading: 0.1,
  done: 0,
};

/**
 * Cumulative weight at the *start* of each stage — used to know how far
 * along we are when a stage begins.
 */
const STAGE_OFFSETS: Record<BulkJobStage, number> = {
  queued: 0,
  fetching: 0,
  generating: 0.05,
  zipping: 0.75,
  uploading: 0.9,
  done: 1,
};

/**
 * Returns a 0..1 fraction of overall progress for a running or terminal job.
 * During `generating`, the fraction grows smoothly as per-dispatcher files
 * complete. During `zipping` / `uploading`, the fraction is fixed at the
 * start of the stage — those stages don't have sub-progress, so the bar
 * just sits but doesn't reach 100% until the upload finishes.
 *
 * `done` / `failed` / unknown → 1 (bar full).
 */
export function computeProgressFraction(
  job: Pick<BulkJob, "stage" | "status" | "done" | "total">,
): number {
  if (job.status === "done" || job.status === "failed") return 1;

  const stage = job.stage;
  const offset = STAGE_OFFSETS[stage] ?? 0;

  if (stage === "generating") {
    const total = job.total || 0;
    const done = Math.min(job.done || 0, total);
    const inner = total > 0 ? done / total : 0;
    return offset + inner * STAGE_WEIGHTS.generating;
  }

  return offset;
}

export function computeProgressPercent(
  job: Pick<BulkJob, "stage" | "status" | "done" | "total">,
): number {
  return Math.round(computeProgressFraction(job) * 100);
}
