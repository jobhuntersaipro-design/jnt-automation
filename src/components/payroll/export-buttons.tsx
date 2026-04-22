"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink } from "lucide-react";

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
