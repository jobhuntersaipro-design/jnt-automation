"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  announceBulkExportStarted,
  downloadZip,
  useActiveJobs,
  type ActiveJob,
  type BulkJobKind,
  type BulkJobStage,
} from "./bulk-jobs-indicator";
import { computeProgressPercent } from "@/lib/staff/bulk-progress";

export interface RecentJob {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  stage: BulkJobStage;
  done: number;
  total: number;
  year: number;
  month: number;
  format: "csv" | "pdf";
  kind?: BulkJobKind;
  branchCode?: string;
  currentLabel?: string;
  error?: string;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Human-readable label for each stage of a running job. */
function stageLabel(
  stage: BulkJobStage,
  done: number,
  total: number,
  currentLabel?: string,
): string {
  switch (stage) {
    case "queued":
      return "Queued…";
    case "fetching":
      return "Fetching records…";
    case "generating":
      if (total <= 0) return "Generating…";
      if (currentLabel) return `Generating ${currentLabel} · ${done} / ${total}`;
      return `Generating ${done} / ${total}`;
    case "zipping":
      return "Bundling zip…";
    case "uploading":
      return "Uploading…";
    case "done":
      return "Done";
  }
}

/**
 * Rate-based ETA, only shown during the `generating` stage once we have a
 * stable sample (>=3 files). Anything earlier gives wildly noisy estimates
 * that jump around in the UI.
 */
function formatEta(
  stage: BulkJobStage,
  done: number,
  total: number,
  startedAt: number | null,
): string | null {
  if (stage !== "generating" || done < 3 || total <= 0 || !startedAt) return null;
  const elapsed = Date.now() - startedAt;
  if (elapsed <= 0) return null;
  const remaining = total - done;
  if (remaining <= 0) return null;
  const etaMs = (elapsed / done) * remaining;
  if (etaMs < 15_000) return "~10s remaining";
  if (etaMs < 60_000) return `~${Math.round(etaMs / 1_000 / 5) * 5}s remaining`;
  const mins = Math.round(etaMs / 60_000);
  if (mins < 60) return `~${mins} min remaining`;
  return `~${Math.round(mins / 60)} h remaining`;
}

function zipName(
  year: number,
  month: number,
  kind?: BulkJobKind,
  branchCode?: string,
): string {
  const mm = String(month).padStart(2, "0");
  if (kind === "payslip") {
    return `payslips_${branchCode ?? "export"}_${mm}_${year}.zip`;
  }
  return `${year}_${mm}_details.zip`;
}

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function formatLabel(year: number, month: number): string {
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${year}`;
}

/**
 * Downloads Center panel — rendered inside the notification bell popover's
 * "Downloads" tab. Polls `/recent` every 3 s while mounted (i.e. while the
 * panel is open) and lets the agent download / retry completed jobs.
 *
 * Spec: context/features/sheets-removal-downloads-center-drawer-spec.md Part 2.
 */
export function DownloadsPanel() {
  const [recent, setRecent] = useState<RecentJob[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const active = useActiveJobs();

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/dispatchers/month-detail/bulk/recent");
      if (!res.ok) return;
      const data = await res.json();
      setRecent((data.jobs ?? []) as RecentJob[]);
    } catch {
      // transient
    }
  }, []);

  // Adaptive poll cadence: 1.5 s while any row is still running (so stage +
  // counter feel live during generation), 3 s when everything is terminal.
  const anyActive = useMemo(
    () =>
      recent.some((j) => j.status === "queued" || j.status === "running") ||
      active.length > 0,
    [recent, active],
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (cancelled) return;
      await fetchRecent();
      if (cancelled) return;
      const delay = anyActive ? 1_500 : 3_000;
      timeoutRef.current = setTimeout(loop, delay);
    };
    loop();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchRecent, anyActive]);

  // Merge active (from the shared store) + recent (from /recent) so the panel
  // never flashes between poll boundaries when a job transitions.
  const rows = useMemo(() => {
    const byId = new Map<string, RecentJob>();
    for (const j of recent) byId.set(j.jobId, j);
    // Active always overrides — it reflects the most up-to-the-second state.
    for (const j of active as ActiveJob[]) {
      const existing = byId.get(j.jobId);
      byId.set(j.jobId, {
        ...(existing ?? {
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        ...j,
      } as RecentJob);
    }
    return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [active, recent]);

  const handleDownload = useCallback((job: RecentJob) => {
    void downloadZip(job.jobId, zipName(job.year, job.month, job.kind, job.branchCode));
  }, []);

  const handleRetry = useCallback(
    async (job: RecentJob) => {
      setRetrying(job.jobId);
      try {
        const res = await fetch("/api/dispatchers/month-detail/bulk/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: job.year,
            month: job.month,
            format: job.format,
          }),
        });
        if (!res.ok) {
          toast.error("Retry failed");
          return;
        }
        const { jobId } = (await res.json()) as { jobId?: string };
        if (jobId) {
          announceBulkExportStarted({
            jobId,
            year: job.year,
            month: job.month,
            format: job.format,
          });
          toast.success("Retry queued");
          await fetchRecent();
        }
      } catch {
        toast.error("Retry failed");
      } finally {
        setRetrying(null);
      }
    },
    [fetchRecent],
  );

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/dispatchers/month-detail/bulk/recent", {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Clear failed");
        return;
      }
      // Optimistic — /recent endpoint now also cancels in-flight jobs, so
      // both the recent list and the active rows should disappear. Refetch
      // once to pick up whatever Redis state landed.
      setRecent([]);
      await fetchRecent();
    } catch {
      toast.error("Clear failed");
    } finally {
      setClearing(false);
    }
  }, [fetchRecent]);

  const handleCancel = useCallback(
    async (job: RecentJob) => {
      setCancelling(job.jobId);
      try {
        const res = await fetch(
          `/api/dispatchers/month-detail/bulk/${job.jobId}/cancel`,
          { method: "POST" },
        );
        if (!res.ok) {
          toast.error("Cancel failed");
          return;
        }
        toast.success("Export cancelled");
        await fetchRecent();
      } catch {
        toast.error("Cancel failed");
      } finally {
        setCancelling(null);
      }
    },
    [fetchRecent],
  );

  if (rows.length === 0) {
    return (
      <div data-testid="downloads-panel" className="py-6 text-center">
        <p className="text-[0.84rem] text-on-surface-variant">
          No recent exports.
        </p>
        <p className="text-[0.72rem] text-on-surface-variant/70 mt-1">
          Start an export from the Bulk Detail button on Dispatchers.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="downloads-panel" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[0.72rem] text-on-surface-variant/70">
          Expires after 2 hours.
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={clearing || recent.length === 0}
          className="text-[0.72rem] font-medium text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50 cursor-pointer"
        >
          {clearing ? "Clearing…" : "Clear all"}
        </button>
      </div>
      <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {rows.map((job) => (
          <DownloadRow
            key={job.jobId}
            job={job}
            retrying={retrying === job.jobId}
            cancelling={cancelling === job.jobId}
            onDownload={() => handleDownload(job)}
            onRetry={() => handleRetry(job)}
            onCancel={() => handleCancel(job)}
          />
        ))}
      </ul>
    </div>
  );
}

function DownloadRow({
  job,
  retrying,
  cancelling,
  onDownload,
  onRetry,
  onCancel,
}: {
  job: RecentJob;
  retrying: boolean;
  cancelling: boolean;
  onDownload: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const label = formatLabel(job.year, job.month);
  const formatLabel_ =
    job.kind === "payslip" ? "Payslips" : `${job.format.toUpperCase()} export`;

  if (job.status === "queued" || job.status === "running") {
    const stage = job.stage ?? (job.status === "queued" ? "queued" : "generating");
    const pct = computeProgressPercent({
      stage,
      status: job.status,
      done: job.done,
      total: job.total,
    });
    const label_ = stageLabel(stage, job.done, job.total, job.currentLabel);
    const eta = formatEta(stage, job.done, job.total, job.startedAt);
    return (
      <li
        data-testid="download-row"
        data-job-id={job.jobId}
        data-status={job.status}
        data-stage={stage}
        className="rounded-lg border border-outline-variant/25 p-3 bg-surface-container-low/50"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" aria-hidden />
          <span className="text-[0.78rem] font-medium text-on-surface">
            {formatLabel_} · {label}
          </span>
          {stage !== "generating" || job.total === 0 ? (
            <span className="ml-auto" />
          ) : (
            <span className="ml-auto text-[0.72rem] text-on-surface-variant tabular-nums">
              {pct}%
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            aria-label="Cancel export"
            title="Cancel this export"
            className="p-1 rounded text-on-surface-variant hover:text-critical hover:bg-critical/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
        <div className="mt-2 h-1 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.7rem] text-on-surface-variant/80 tabular-nums">
          <span>{label_}</span>
          {eta && <span className="text-on-surface-variant">{eta}</span>}
        </div>
      </li>
    );
  }

  if (job.status === "done") {
    return (
      <li
        data-testid="download-row"
        data-job-id={job.jobId}
        data-status="done"
        className="rounded-lg border border-outline-variant/25 p-3 bg-white"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[0.78rem] font-medium text-on-surface">
              {formatLabel_} · {label}
            </p>
            <p className="text-[0.7rem] text-on-surface-variant">
              {relative(job.updatedAt)} · {zipName(job.year, job.month, job.kind, job.branchCode)}
            </p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-white bg-brand rounded hover:bg-brand/90 transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3" aria-hidden />
            Download
          </button>
        </div>
      </li>
    );
  }

  // failed
  return (
    <li
      data-testid="download-row"
      data-job-id={job.jobId}
      data-status="failed"
      className="rounded-lg border border-critical/30 p-3 bg-critical/5"
    >
      <div className="flex items-center gap-2">
        <XCircle className="w-3.5 h-3.5 text-critical" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[0.78rem] font-medium text-on-surface">
            {formatLabel_} · {label}
          </p>
          <p className="text-[0.7rem] text-critical truncate">
            {job.error || "Export failed"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1 px-2 py-1 text-[0.75rem] font-medium text-on-surface border border-outline-variant/40 rounded hover:bg-surface-hover transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} aria-hidden />
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    </li>
  );
}
