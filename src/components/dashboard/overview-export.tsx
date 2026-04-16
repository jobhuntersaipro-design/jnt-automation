"use client";

import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { toast } from "sonner";

export function OverviewExport() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  function buildQueryString(type: string) {
    const params = new URLSearchParams();
    params.set("type", type);
    const branches = searchParams.get("branches");
    if (branches) params.set("branches", branches);
    const fromMonth = searchParams.get("fromMonth");
    if (fromMonth) params.set("fromMonth", fromMonth);
    const fromYear = searchParams.get("fromYear");
    if (fromYear) params.set("fromYear", fromYear);
    const toMonth = searchParams.get("toMonth");
    if (toMonth) params.set("toMonth", toMonth);
    const toYear = searchParams.get("toYear");
    if (toYear) params.set("toYear", toYear);
    return params.toString();
  }

  function getFiltersBody() {
    const now = new Date();
    let defaultToMonth = now.getMonth();
    let defaultToYear = now.getFullYear();
    if (defaultToMonth === 0) { defaultToMonth = 12; defaultToYear--; }
    let defaultFromMonth = defaultToMonth - 2;
    let defaultFromYear = defaultToYear;
    if (defaultFromMonth <= 0) { defaultFromMonth += 12; defaultFromYear--; }

    return {
      branches: searchParams.get("branches")?.split(",").filter(Boolean) ?? [],
      fromMonth: Number(searchParams.get("fromMonth") ?? defaultFromMonth),
      fromYear: Number(searchParams.get("fromYear") ?? defaultFromYear),
      toMonth: Number(searchParams.get("toMonth") ?? defaultToMonth),
      toYear: Number(searchParams.get("toYear") ?? defaultToYear),
    };
  }

  function handleCSV(type: "dispatcher" | "branch") {
    setOpen(false);
    window.open(`/api/overview/export/csv?${buildQueryString(type)}`, "_blank");
  }

  async function handleSheets() {
    setOpen(false);
    setExporting(true);
    try {
      const res = await fetch("/api/overview/export/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getFiltersBody()),
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error === "NOT_CONNECTED") {
          toast.error("Google Sheets not connected", {
            description: "Connect Google Sheets in Settings first.",
            action: {
              label: "Connect",
              onClick: () => window.open("/api/auth/google-sheets/connect", "_self"),
            },
          });
          return;
        }
        if (data.error === "TOKEN_REVOKED") {
          toast.error("Google Sheets access revoked", {
            description: "Reconnect Google Sheets in Settings.",
          });
          return;
        }
      }

      if (!res.ok) {
        toast.error("Export failed", { description: "Something went wrong. Try again." });
        return;
      }

      const data = await res.json();
      toast.success("Exported to Google Sheets", {
        action: {
          label: "Open",
          onClick: () => window.open(data.spreadsheetUrl, "_blank"),
        },
      });
    } catch {
      toast.error("Export failed", { description: "Network error. Try again." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-[rgba(195,198,214,0.3)] hover:border-[rgba(195,198,214,0.6)] transition-colors disabled:opacity-50"
      >
        <Download size={13} className="text-on-surface-variant" />
        {exporting ? "Exporting..." : "Export"}
        <ChevronDown
          size={11}
          className={`text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-[rgba(195,198,214,0.2)] z-50 w-56 py-1 overflow-hidden">
          <p className="px-3.5 pt-2 pb-1 text-[0.6rem] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            CSV Download
          </p>
          <button
            onClick={() => handleCSV("dispatcher")}
            className="w-full text-left px-3.5 py-2 text-[0.77rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors flex items-center gap-2"
          >
            <Download size={13} />
            Dispatcher Performance
          </button>
          <button
            onClick={() => handleCSV("branch")}
            className="w-full text-left px-3.5 py-2 text-[0.77rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors flex items-center gap-2"
          >
            <Download size={13} />
            Branch Summary
          </button>
          <div className="border-t border-outline-variant/20 my-1" />
          <p className="px-3.5 pt-2 pb-1 text-[0.6rem] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            Google Sheets
          </p>
          <button
            onClick={handleSheets}
            className="w-full text-left px-3.5 py-2 text-[0.77rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet size={13} />
            Export All to Sheets
          </button>
        </div>
      )}
    </div>
  );
}
