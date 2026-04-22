"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ActiveJob {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  done: number;
  total: number;
  year: number;
  month: number;
  format: "csv" | "pdf";
}

interface SeededJob {
  jobId: string;
  year: number;
  month: number;
  format: "csv" | "pdf";
}

function zipName(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}_${mm}_details.zip`;
}

async function downloadZip(jobId: string, filename: string) {
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
 * Call after starting a bulk export so the indicator can track it even if
 * the job finishes between 3 s poll ticks (otherwise short-running CSVs can
 * complete without ever being caught as "active" → no completion toast).
 */
export function announceBulkExportStarted(job: SeededJob): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SeededJob>(BULK_EXPORT_STARTED_EVENT, { detail: job }),
  );
}

/**
 * Background indicator that polls active bulk-export jobs and:
 *  - Renders an animated progress ring absolutely positioned over the
 *    notification bell while any job is running.
 *  - Fires a toast (with a "Download" action) whenever a job transitions
 *    from running → done.
 *
 * The component has no visual footprint in the layout; the ring is
 * absolutely positioned, so place it as a sibling of NotificationBell.
 */
export function BulkJobsIndicator() {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  // Jobs we've seen active (or been told about) that still need a finalize toast
  const watched = useRef<Map<string, SeededJob>>(new Map());
  // Jobs we've already toasted for — prevents double-toast under concurrent
  // ticks + React Strict Mode double-mount.
  const finalized = useRef<Set<string>>(new Set());
  // Guard against overlapping ticks (setInterval doesn't await)
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/dispatchers/month-detail/bulk/active");
        if (!res.ok) return;
        const data = await res.json();
        const next: ActiveJob[] = data.jobs ?? [];

        // Detect jobs that were previously tracked but are no longer
        // in the active list — those either finished or failed.
        // Snapshot entries before awaiting so the map can be mutated below.
        for (const [jobId, prev] of Array.from(watched.current.entries())) {
          if (next.find((j) => j.jobId === jobId)) continue;
          if (finalized.current.has(jobId)) {
            watched.current.delete(jobId);
            continue;
          }
          // Claim synchronously — before any await — so overlapping polls
          // don't re-enter this branch and double-toast.
          finalized.current.add(jobId);
          watched.current.delete(jobId);

          try {
            const statusRes = await fetch(
              `/api/dispatchers/month-detail/bulk/${jobId}/status`,
            );
            if (!statusRes.ok) continue;
            const status = await statusRes.json();
            if (status.status === "done") {
              const filename = zipName(prev.year, prev.month);
              toast.success(`${prev.format.toUpperCase()} export ready`, {
                description: filename,
                duration: 30_000,
                action: {
                  label: "Download",
                  onClick: () => downloadZip(jobId, filename),
                },
              });
            } else if (status.status === "failed") {
              toast.error("Bulk export failed", {
                description: status.error || "Unknown error",
              });
            }
          } catch {
            // Ignore transient polling errors
          }
        }

        if (!cancelled) {
          setJobs(next);
          for (const j of next) {
            if (finalized.current.has(j.jobId)) continue;
            watched.current.set(j.jobId, {
              jobId: j.jobId,
              year: j.year,
              month: j.month,
              format: j.format,
            });
          }
        }
      } catch {
        // Ignore transient polling errors
      } finally {
        inFlight.current = false;
      }
    }

    function onStart(e: Event) {
      const detail = (e as CustomEvent<SeededJob>).detail;
      if (!detail?.jobId || finalized.current.has(detail.jobId)) return;
      watched.current.set(detail.jobId, detail);
      // Kick off an immediate poll so the ring shows up right away instead
      // of waiting up to 3 s for the next tick.
      tick();
    }

    window.addEventListener(BULK_EXPORT_STARTED_EVENT, onStart);
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.removeEventListener(BULK_EXPORT_STARTED_EVENT, onStart);
      clearInterval(id);
    };
  }, []);

  if (jobs.length === 0) return null;

  // Overall progress across all active jobs
  const totalFiles = jobs.reduce((s, j) => s + (j.total || 0), 0);
  const totalDone = jobs.reduce((s, j) => s + (j.done || 0), 0);
  const fraction = totalFiles > 0 ? totalDone / totalFiles : 0;
  const percent = Math.round(fraction * 100);

  // SVG circle progress ring — r=13 gives circumference ≈ 81.68
  const r = 13;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - fraction);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-label={`${jobs.length} bulk export${jobs.length !== 1 ? "s" : ""} in progress, ${percent}% done`}
      title={`${totalDone}/${totalFiles} files · ${percent}%`}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Background ring */}
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="rgba(0,86,210,0.12)"
          strokeWidth="2"
        />
        {/* Progress arc */}
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
