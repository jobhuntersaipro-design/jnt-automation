"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  announceBulkExportStarted,
  downloadZip,
  useActiveJobs,
  type ActiveJob,
} from "./bulk-jobs-indicator";

export interface RecentJob {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  done: number;
  total: number;
  year: number;
  month: number;
  format: "csv" | "pdf";
  error?: string;
  createdAt: number;
  updatedAt: number;
}

function zipName(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
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

  useEffect(() => {
    fetchRecent();
    const id = setInterval(fetchRecent, 3_000);
    return () => clearInterval(id);
  }, [fetchRecent]);

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
    void downloadZip(job.jobId, zipName(job.year, job.month));
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
      setRecent([]);
    } catch {
      toast.error("Clear failed");
    } finally {
      setClearing(false);
    }
  }, []);

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
            onDownload={() => handleDownload(job)}
            onRetry={() => handleRetry(job)}
          />
        ))}
      </ul>
    </div>
  );
}

function DownloadRow({
  job,
  retrying,
  onDownload,
  onRetry,
}: {
  job: RecentJob;
  retrying: boolean;
  onDownload: () => void;
  onRetry: () => void;
}) {
  const label = formatLabel(job.year, job.month);
  const formatLabel_ = job.format.toUpperCase();

  if (job.status === "queued" || job.status === "running") {
    const pct =
      job.total > 0
        ? Math.min(100, Math.round((job.done / job.total) * 100))
        : 0;
    return (
      <li
        data-testid="download-row"
        data-job-id={job.jobId}
        data-status={job.status}
        className="rounded-lg border border-outline-variant/25 p-3 bg-surface-container-low/50"
      >
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" aria-hidden />
          <span className="text-[0.78rem] font-medium text-on-surface">
            {formatLabel_} export · {label}
          </span>
          <span className="ml-auto text-[0.72rem] text-on-surface-variant tabular-nums">
            {job.total > 0 ? `${job.done}/${job.total}` : job.status === "queued" ? "queued" : "…"}
          </span>
        </div>
        <div className="mt-2 h-1 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
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
              {formatLabel_} export · {label}
            </p>
            <p className="text-[0.7rem] text-on-surface-variant">
              {relative(job.updatedAt)} · {zipName(job.year, job.month)}
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
            {formatLabel_} export · {label}
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
