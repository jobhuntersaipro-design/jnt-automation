"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Download, ExternalLink } from "lucide-react";

interface ExportDropdownProps {
  uploadId: string;
}

/**
 * Export dropdown for the payroll history list rows.
 * Shows "Export CSV" and "Export to Google Sheets" options.
 */
export function ExportDropdown({ uploadId }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleCSV = useCallback(() => {
    setOpen(false);
    // Direct download via GET
    window.open(`/api/payroll/upload/${uploadId}/export/csv`, "_blank");
  }, [uploadId]);

  const handleSheets = useCallback(async () => {
    setOpen(false);
    setExporting(true);
    try {
      const res = await fetch(`/api/payroll/upload/${uploadId}/export/sheets`, {
        method: "POST",
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error === "NOT_CONNECTED" && data.connectUrl) {
          // Redirect to Google OAuth
          window.location.href = data.connectUrl;
          return;
        }
        if (data.error === "TOKEN_REVOKED") {
          toast.error("Google Sheets connection lost. Reconnect in Settings.");
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Export failed");
        return;
      }

      const { spreadsheetUrl } = await res.json();
      toast.success("Exported to Google Sheets", {
        action: {
          label: "Open",
          onClick: () => window.open(spreadsheetUrl, "_blank"),
        },
      });
    } catch {
      toast.error("Failed to export to Google Sheets");
    } finally {
      setExporting(false);
    }
  }, [uploadId]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="inline-flex items-center gap-0.5 px-2 py-1 text-[0.75rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded transition-colors disabled:opacity-50"
      >
        {exporting ? "Exporting..." : "Export"}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 z-20 bg-surface-card border border-outline-variant/20 rounded-md shadow-lg py-1 min-w-44">
            <button
              onClick={handleCSV}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left"
            >
              <Download className="w-3.5 h-3.5 text-on-surface-variant" />
              CSV
            </button>
            <button
              onClick={handleSheets}
              className="flex items-center gap-2 w-full px-3 py-2 text-[0.82rem] text-on-surface hover:bg-surface-hover transition-colors text-left"
            >
              <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant" />
              Google Sheets
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface ExportButtonsProps {
  uploadId: string;
}

/**
 * Inline export buttons for the salary table page header.
 */
export function ExportButtons({ uploadId }: ExportButtonsProps) {
  const [exporting, setExporting] = useState(false);

  const handleCSV = useCallback(() => {
    window.open(`/api/payroll/upload/${uploadId}/export/csv`, "_blank");
  }, [uploadId]);

  const handleSheets = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/payroll/upload/${uploadId}/export/sheets`, {
        method: "POST",
      });

      if (res.status === 401) {
        const data = await res.json();
        if (data.error === "NOT_CONNECTED" && data.connectUrl) {
          window.location.href = data.connectUrl;
          return;
        }
        if (data.error === "TOKEN_REVOKED") {
          toast.error("Google Sheets connection lost. Reconnect in Settings.");
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Export failed");
        return;
      }

      const { spreadsheetUrl } = await res.json();
      toast.success("Exported to Google Sheets", {
        action: {
          label: "Open",
          onClick: () => window.open(spreadsheetUrl, "_blank"),
        },
      });
    } catch {
      toast.error("Failed to export to Google Sheets");
    } finally {
      setExporting(false);
    }
  }, [uploadId]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCSV}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export CSV
      </button>
      <button
        onClick={handleSheets}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {exporting ? "Exporting..." : "Google Sheets"}
      </button>
    </div>
  );
}
