"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { computeProgressFraction } from "@/lib/staff/bulk-progress";

export type BulkJobStage =
  | "queued"
  | "fetching"
  | "generating"
  | "zipping"
  | "uploading"
  | "done";

export type BulkJobKind = "month-detail" | "payslip";

export interface ActiveJob {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  stage: BulkJobStage;
  done: number;
  total: number;
  year: number;
  month: number;
  format: "csv" | "pdf";
  kind?: BulkJobKind;
  currentLabel?: string;
  startedAt: number | null;
}

interface SeededJob {
  jobId: string;
  year: number;
  month: number;
  format: "csv" | "pdf";
  kind?: BulkJobKind;
  /** Payslip jobs only — carried through for the zip filename */
  branchCode?: string;
}

function zipName(
  year: number,
  month: number,
  kind: BulkJobKind | undefined,
  branchCode: string | undefined,
): string {
  const mm = String(month).padStart(2, "0");
  if (kind === "payslip") {
    return `payslips_${branchCode ?? "export"}_${mm}_${year}.zip`;
  }
  return `${year}_${mm}_details.zip`;
}

/** Client-side download helper used by both the toast action and the panel. */
export async function downloadZip(jobId: string, filename: string): Promise<void> {
  try {
    const res = await fetch(`/api/dispatchers/month-detail/bulk/${jobId}/download`);
    if (!res.ok) {
      toast.error("Download expired — export again from the Bulk Detail button.");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  } catch {
    toast.error("Download failed");
  }
}

const BULK_EXPORT_STARTED_EVENT = "bulk-export:started";

/**
 * Call after starting a bulk export so the indicator tracks it even if the
 * job finishes between 3 s poll ticks. Without this, short-running CSVs can
 * complete and never fire a completion toast.
 */
export function announceBulkExportStarted(job: SeededJob): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SeededJob>(BULK_EXPORT_STARTED_EVENT, { detail: job }),
  );
}

/* ─── Shared store ─────────────────────────────────────────────────── */

/**
 * Module-level store that lives for the lifetime of the React root. It owns:
 *   - the 3 s poll of /active (a single poller across the whole app)
 *   - the active-job list (read by the ring overlay and the Downloads panel)
 *   - a small "just-finished" queue (powers the Downloads red-dot)
 *
 * Components subscribe via `useActiveJobs()` / `useJustFinishedCount()`.
 */
type Listener = () => void;

const RECENT_FINISH_WINDOW_MS = 10_000;

class BulkJobsStore {
  activeJobs: ActiveJob[] = [];
  private listeners = new Set<Listener>();
  private watched = new Map<string, SeededJob>();
  private finalized = new Set<string>();
  private inFlight = false;
  private started = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  // jobId → timestamp of transition into done/failed
  private justFinished = new Map<string, number>();
  private justFinishedAcknowledged = new Set<string>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  getSnapshot = (): ActiveJob[] => this.activeJobs;

  /** Count of jobs that finished within the last 10 s and haven't been acknowledged. */
  unacknowledgedFinishCount(): number {
    const cutoff = Date.now() - RECENT_FINISH_WINDOW_MS;
    let n = 0;
    for (const [id, ts] of this.justFinished) {
      if (ts < cutoff) continue;
      if (this.justFinishedAcknowledged.has(id)) continue;
      n++;
    }
    return n;
  }

  /**
   * Earliest absolute ms timestamp at which an unacknowledged just-finished
   * entry falls out of the window. Returns null if nothing is pending — lets
   * the bell hook avoid a 1 s ticker when idle.
   */
  nextUnacknowledgedExpiryAt(): number | null {
    let earliest: number | null = null;
    for (const [id, ts] of this.justFinished) {
      if (this.justFinishedAcknowledged.has(id)) continue;
      const expiresAt = ts + RECENT_FINISH_WINDOW_MS;
      if (earliest === null || expiresAt < earliest) earliest = expiresAt;
    }
    return earliest;
  }

  /** Call when the Downloads tab opens — clears the red dot. */
  acknowledgeFinishes(): void {
    for (const id of this.justFinished.keys()) {
      this.justFinishedAcknowledged.add(id);
    }
    this.emit();
  }

  seed(job: SeededJob): void {
    if (!job?.jobId || this.finalized.has(job.jobId)) return;
    this.watched.set(job.jobId, job);
    // kick an immediate tick so the ring shows up right away, and tighten
    // the poll cadence to 1.5 s while this job is in flight.
    void this.tick();
    this.scheduleNext();
  }

  start(): void {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener(BULK_EXPORT_STARTED_EVENT, this.onStart);
    void this.tick();
    this.scheduleNext();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener(BULK_EXPORT_STARTED_EVENT, this.onStart);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  /**
   * Adaptive poll interval: 1.5 s while any job is active (tight feedback
   * during generation), 3 s when idle (keeps background load low).
   */
  private scheduleNext(): void {
    if (!this.started) return;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    const delay =
      this.activeJobs.length > 0 || this.watched.size > 0 ? 1_500 : 3_000;
    this.timeoutId = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNext());
    }, delay);
  }

  private onStart = (e: Event) => {
    const detail = (e as CustomEvent<SeededJob>).detail;
    this.seed(detail);
  };

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const res = await fetch("/api/dispatchers/month-detail/bulk/active");
      if (!res.ok) return;
      const data = await res.json();
      const next: ActiveJob[] = data.jobs ?? [];

      // Finalize jobs that dropped out of the active set.
      for (const [jobId, prev] of Array.from(this.watched.entries())) {
        if (next.find((j) => j.jobId === jobId)) continue;
        if (this.finalized.has(jobId)) {
          this.watched.delete(jobId);
          continue;
        }
        // Claim synchronously before awaiting — prevents double-toast when
        // React Strict Mode or overlapping ticks race.
        this.finalized.add(jobId);
        this.watched.delete(jobId);

        try {
          const statusRes = await fetch(
            `/api/dispatchers/month-detail/bulk/${jobId}/status`,
          );
          if (!statusRes.ok) continue;
          const status = await statusRes.json();
          if (status.status === "done") {
            this.justFinished.set(jobId, Date.now());
            const filename = zipName(prev.year, prev.month, prev.kind, prev.branchCode);
            const title =
              prev.kind === "payslip"
                ? "Payslips ready"
                : `${prev.format.toUpperCase()} export ready`;
            toast.success(title, {
              description: filename,
              duration: 15_000,
              action: {
                label: "Download",
                onClick: () => downloadZip(jobId, filename),
              },
            });
          } else if (status.status === "failed") {
            this.justFinished.set(jobId, Date.now());
            toast.error("Bulk export failed", {
              description: status.error || "Unknown error",
            });
          }
        } catch {
          // ignore transient
        }
      }

      this.activeJobs = next;
      for (const j of next) {
        if (this.finalized.has(j.jobId)) continue;
        // Preserve seed-provided context (branchCode) — tick data doesn't
        // include it, so merge rather than overwrite if we've already seen
        // this job via announceBulkExportStarted.
        const existing = this.watched.get(j.jobId);
        this.watched.set(j.jobId, {
          jobId: j.jobId,
          year: j.year,
          month: j.month,
          format: j.format,
          kind: j.kind ?? existing?.kind,
          branchCode: existing?.branchCode,
        });
      }
      // Prune old justFinished entries (anything > 5× the window)
      const cutoff = Date.now() - RECENT_FINISH_WINDOW_MS * 5;
      for (const [id, ts] of this.justFinished) {
        if (ts < cutoff) this.justFinished.delete(id);
      }
      this.emit();
    } catch {
      // ignore transient
    } finally {
      this.inFlight = false;
    }
  }
}

const bulkJobsStore = new BulkJobsStore();
const EMPTY_JOBS: ActiveJob[] = [];

/** Hook — subscribes to the live active-jobs list. */
export function useActiveJobs(): ActiveJob[] {
  return useSyncExternalStore(
    bulkJobsStore.subscribe.bind(bulkJobsStore),
    bulkJobsStore.getSnapshot,
    () => EMPTY_JOBS,
  );
}

/** Hook — how many jobs finished in the last 10 s and haven't been seen. */
export function useJustFinishedCount(): number {
  const [, setRerender] = useState(0);
  useEffect(() => {
    const unsub = bulkJobsStore.subscribe(() => setRerender((x) => x + 1));
    // Schedule a single timeout per pending entry to expire the 10 s window —
    // avoids a perpetual 1 s ticker when nothing is pending (the common case).
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleExpiry = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      const nextExpiry = bulkJobsStore.nextUnacknowledgedExpiryAt();
      if (nextExpiry === null) return;
      const delay = Math.max(100, nextExpiry - Date.now());
      expiryTimer = setTimeout(() => {
        setRerender((x) => x + 1);
        scheduleExpiry();
      }, delay);
    };
    const unsubExpiry = bulkJobsStore.subscribe(scheduleExpiry);
    scheduleExpiry();
    return () => {
      unsub();
      unsubExpiry();
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, []);
  return bulkJobsStore.unacknowledgedFinishCount();
}

/** Call when the Downloads tab opens — clears the red dot. */
export function acknowledgeDownloadsSeen(): void {
  bulkJobsStore.acknowledgeFinishes();
}

/* ─── Progress ring component ──────────────────────────────────────── */

/**
 * Thin consumer that mounts the store on the page and renders the SVG
 * progress ring over the notification bell while any job is in flight.
 *
 * The polling + state live in `bulkJobsStore` — this component only renders.
 */
export function BulkJobsIndicator() {
  const jobs = useActiveJobs();

  // Boot the store once per app (StrictMode double-mount is idempotent via `started`).
  useEffect(() => {
    bulkJobsStore.start();
    return () => {
      // We intentionally don't stop on unmount — the store is app-scoped and
      // unmounting just the ring shouldn't kill the poller (the panel also
      // depends on it).
    };
  }, []);

  if (jobs.length === 0) return null;

  const totalFiles = jobs.reduce((s, j) => s + (j.total || 0), 0);
  const totalDone = jobs.reduce((s, j) => s + (j.done || 0), 0);
  // Weighted average across jobs — fraction includes the
  // fetching/zipping/uploading overhead so the ring doesn't freeze at 100%
  // while the last stages run. Falls back to file-count ratio when no job
  // has a total yet.
  const fraction =
    jobs.length > 0
      ? jobs.reduce((s, j) => s + computeProgressFraction(j), 0) / jobs.length
      : 0;
  const percent = Math.round(fraction * 100);

  const r = 13;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - fraction);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-label={`${jobs.length} bulk export${jobs.length !== 1 ? "s" : ""} in progress, ${percent}% done`}
      title={`${totalDone}/${totalFiles} files · ${percent}%`}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90" aria-hidden="true">
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(0,86,210,0.12)" strokeWidth="2" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="#0056D2"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
    </div>
  );
}

