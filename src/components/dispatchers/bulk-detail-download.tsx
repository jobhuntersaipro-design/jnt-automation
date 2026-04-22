"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, ChevronDown, Download } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { announceBulkExportStarted } from "@/components/dashboard/bulk-jobs-indicator";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function currentYearList(): number[] {
  const now = new Date();
  const y = now.getFullYear();
  return [y - 2, y - 1, y, y + 1];
}

export function BulkDetailDownload() {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const now = new Date();
  // Default to the previous completed month
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);

  useClickOutside(ref, () => setOpen(false));

  const handleDownload = async (format: "csv" | "pdf") => {
    setBusy(format);
    try {
      const res = await fetch("/api/dispatchers/month-detail/bulk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to start export" }));
        toast.error(data.error || "Failed to start export");
        return;
      }
      const { jobId } = (await res.json().catch(() => ({}))) as { jobId?: string };
      if (jobId) {
        // Hand the jobId directly to the indicator so short-running exports
        // (CSVs that finish in <3 s) still fire a completion toast.
        announceBulkExportStarted({ jobId, year, month, format });
      }
      const mm = String(month).padStart(2, "0");
      toast.success("Export queued", {
        description: `${year}_${mm}_details.zip — you'll be notified on the bell when it's ready.`,
      });
      setOpen(false);
    } catch {
      toast.error("Failed to start export");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-on-surface bg-white border border-outline-variant/30 rounded-[0.375rem] hover:bg-surface-hover transition-colors"
      >
        <Archive className="w-3.5 h-3.5" />
        Bulk Detail
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 rounded-xl bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] border border-outline-variant/20 p-4">
          <p className="text-[0.82rem] font-semibold text-on-surface">
            Download all dispatcher details
          </p>
          <p className="text-[0.72rem] text-on-surface-variant mt-0.5">
            Bundles every dispatcher's parcel-level detail for the selected
            month into a single zip.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[0.68rem] uppercase tracking-wider text-on-surface-variant font-medium">
                Month
              </span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="px-2 py-1.5 text-[0.82rem] bg-white border border-outline-variant/30 rounded-md outline-none focus:border-brand/40"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.68rem] uppercase tracking-wider text-on-surface-variant font-medium">
                Year
              </span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="px-2 py-1.5 text-[0.82rem] bg-white border border-outline-variant/30 rounded-md outline-none focus:border-brand/40"
              >
                {currentYearList().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() => handleDownload("csv")}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[0.82rem] font-medium text-on-surface border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {busy === "csv" ? "Building zip…" : "Download CSV zip"}
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[0.82rem] font-medium text-white bg-critical rounded-md hover:bg-critical/90 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {busy === "pdf" ? "Building zip…" : "Download PDF zip"}
            </button>
            <p className="text-[0.68rem] text-on-surface-variant/70 mt-1">
              PDF zips can take a minute for large branches — CSV is much
              faster and contains the same data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
