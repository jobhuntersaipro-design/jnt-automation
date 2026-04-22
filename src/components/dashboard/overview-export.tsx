"use client";

import { useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";

export function OverviewExport() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
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

  function handleCSV(type: "dispatcher" | "branch") {
    setOpen(false);
    window.open(`/api/overview/export/csv?${buildQueryString(type)}`, "_blank");
  }

  function handlePDF() {
    setOpen(false);
    window.open(`/api/overview/export/pdf?${buildQueryString("dispatcher")}`, "_blank");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-[rgba(195,198,214,0.3)] hover:border-[rgba(195,198,214,0.6)] transition-colors disabled:opacity-50"
      >
        <Download size={13} className="text-on-surface-variant" />
        Export
        <ChevronDown
          size={11}
          className={`text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-[rgba(195,198,214,0.2)] z-50 w-48 py-1 overflow-hidden">
          <button
            onClick={() => handleCSV("dispatcher")}
            className="w-full text-left px-3.5 py-2.5 text-[0.8rem] text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-2.5"
          >
            <Download size={14} className="text-on-surface-variant" />
            CSV
          </button>
          <button
            onClick={handlePDF}
            className="w-full text-left px-3.5 py-2.5 text-[0.8rem] text-on-surface hover:bg-surface-container-high transition-colors flex items-center gap-2.5"
          >
            <FileText size={14} className="text-on-surface-variant" />
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
