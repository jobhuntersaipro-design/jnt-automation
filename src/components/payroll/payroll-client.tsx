"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { UploadZone } from "./upload-zone";
import { ActiveUploadList, type ActiveUpload } from "./active-upload-list";
import { PayrollHistory, type PayrollRecord } from "./payroll-history";

interface PayrollClientProps {
  initialHistory: PayrollRecord[];
  branchCodes: string[];
}

interface DuplicateInfo {
  clientId: string;
  fileName: string;
  r2Key: string;
  existingUploadId: string;
  branchCode: string;
  month: number;
  year: number;
  message: string;
}

function genId() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function PayrollClient({ initialHistory, branchCodes }: PayrollClientProps) {
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [history, setHistory] = useState<PayrollRecord[]>(initialHistory);
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicateInfo[]>([]);
  const [isReplacing, setIsReplacing] = useState(false);
  const duplicatePrompt = duplicateQueue[0] ?? null;
  const historyRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Show toast for Google Sheets connection callback
  useEffect(() => {
    if (searchParams.get("google_sheets") === "connected") {
      toast.success("Google Sheets connected");
      window.history.replaceState({}, "", "/payroll");
    }
    if (searchParams.get("error") === "google_sheets_failed") {
      toast.error("Failed to connect Google Sheets");
      window.history.replaceState({}, "", "/payroll");
    }
  }, [searchParams]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll");
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // Silent
    }
  }, []);

  const updateUpload = useCallback((id: string, updates: Partial<ActiveUpload>) => {
    setActiveUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  }, []);

  const removeUpload = useCallback((id: string) => {
    setActiveUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const processFile = useCallback(async (file: File) => {
    const clientId = genId();

    // Add to active list immediately
    setActiveUploads((prev) => [
      ...prev,
      { id: clientId, fileName: file.name, status: "UPLOADING" },
    ]);

    try {
      // 1. Get presigned URL (auto-detect mode — no branch/month/year)
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name }),
      });

      if (!initRes.ok) {
        const data = await initRes.json();
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === clientId
              ? { ...u, status: "FAILED", errorMessage: data.error || "Failed to initialize" }
              : u
          )
        );
        return;
      }

      const { r2Key, presignedUrl } = await initRes.json();

      // 2. Upload to R2 with progress tracking
      const contentType = file.name.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/vnd.ms-excel";

      const uploadOk = await new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setActiveUploads((prev) =>
              prev.map((u) => (u.id === clientId ? { ...u, uploadProgress: pct } : u))
            );
          }
        };
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(file);
      });

      if (!uploadOk) {
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === clientId
              ? { ...u, status: "FAILED", errorMessage: "Failed to upload file to storage" }
              : u
          )
        );
        return;
      }

      // 3. Detect branch + month/year, create Upload, trigger processing
      setActiveUploads((prev) =>
        prev.map((u) => (u.id === clientId ? { ...u, status: "DETECTING" } : u))
      );

      const detectRes = await fetch("/api/upload/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r2Key, fileName: file.name }),
      });

      const detectData = await detectRes.json();

      if (!detectRes.ok) {
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === clientId
              ? { ...u, status: "FAILED", errorMessage: detectData.error || "Detection failed" }
              : u
          )
        );
        return;
      }

      if (detectData.isDuplicate) {
        // Queue duplicate confirmation dialog
        setDuplicateQueue((prev) => [...prev, {
          clientId,
          fileName: file.name,
          r2Key,
          existingUploadId: detectData.existingUploadId,
          branchCode: detectData.branchCode,
          month: detectData.month,
          year: detectData.year,
          message: detectData.message,
        }]);
        setActiveUploads((prev) =>
          prev.map((u) =>
            u.id === clientId
              ? {
                  ...u,
                  r2Key,
                  branchCode: detectData.branchCode,
                  month: detectData.month,
                  year: detectData.year,
                  status: "DUPLICATE",
                }
              : u
          )
        );
        return;
      }

      // Success — processing started
      setActiveUploads((prev) =>
        prev.map((u) =>
          u.id === clientId
            ? {
                ...u,
                uploadId: detectData.uploadId,
                r2Key,
                branchCode: detectData.branchCode,
                month: detectData.month,
                year: detectData.year,
                status: "PROCESSING",
              }
            : u
        )
      );
    } catch {
      setActiveUploads((prev) =>
        prev.map((u) =>
          u.id === clientId
            ? { ...u, status: "FAILED", errorMessage: "An unexpected error occurred" }
            : u
        )
      );
    }
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      for (const file of files) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicatePrompt) return;
    setIsReplacing(true);

    try {
      const detectRes = await fetch("/api/upload/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          r2Key: duplicatePrompt.r2Key,
          fileName: duplicatePrompt.fileName,
          confirmReplace: true,
          existingUploadId: duplicatePrompt.existingUploadId,
        }),
      });

      const data = await detectRes.json();
      if (!detectRes.ok) {
        toast.error(data.error || "Failed to replace upload");
        return;
      }

      setActiveUploads((prev) =>
        prev.map((u) =>
          u.id === duplicatePrompt.clientId
            ? {
                ...u,
                uploadId: data.uploadId,
                branchCode: data.branchCode,
                month: data.month,
                year: data.year,
                status: "PROCESSING",
                errorMessage: undefined,
              }
            : u
        )
      );

      // Remove this prompt from queue — next one will show automatically
      setDuplicateQueue((prev) => prev.slice(1));
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsReplacing(false);
    }
  }, [duplicatePrompt]);

  const handleDuplicateCancel = useCallback(async () => {
    if (!duplicatePrompt) return;

    // Remove from active uploads list
    removeUpload(duplicatePrompt.clientId);

    // Clean up the orphaned R2 file
    try {
      await fetch("/api/upload/cleanup-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r2Key: duplicatePrompt.r2Key }),
      });
    } catch {
      // Non-fatal — orphaned R2 objects can be cleaned up later
    }

    // Remove this prompt from queue — next one will show automatically
    setDuplicateQueue((prev) => prev.slice(1));
  }, [duplicatePrompt, removeUpload]);

  return (
    <main className="flex-1 overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-8 lg:gap-10">
        {/* Page header */}
        <div>
          <h1 className="text-[1.3rem] lg:text-[1.6rem] font-bold text-on-surface tracking-tight font-(family-name:--font-manrope)">
            Payroll
          </h1>
          <p className="text-[0.85rem] text-on-surface-variant mt-0.5">
            Upload delivery data and manage monthly payroll records.
          </p>
        </div>

        {/* Upload section */}
        <section className="flex flex-col gap-4">
          <UploadZone onFilesSelected={handleFilesSelected} />

          <ActiveUploadList
            uploads={activeUploads}
            onUpdateUpload={updateUpload}
            onRemoveUpload={removeUpload}
            onUploadComplete={refreshHistory}
          />
        </section>

        {/* Duplicate upload confirmation dialog */}
        {duplicatePrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-on-surface/40" onClick={handleDuplicateCancel} />
            <div className="relative bg-surface-card rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-[0.95rem] font-semibold text-on-surface">
                    Replace existing payroll?
                  </h3>
                  <p className="text-[0.82rem] text-on-surface-variant mt-1.5 leading-relaxed">
                    {duplicatePrompt.message}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleDuplicateCancel}
                  disabled={isReplacing}
                  className="px-4 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDuplicateConfirm}
                  disabled={isReplacing}
                  className="px-4 py-2 text-[0.82rem] font-medium text-white bg-critical hover:bg-critical/90 rounded-md transition-colors disabled:opacity-50"
                >
                  {isReplacing ? "Replacing\u2026" : "Replace & Upload"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-outline-variant/20" />

        {/* Payroll History */}
        <section ref={historyRef}>
          <h2 className="text-[1.1rem] font-semibold text-on-surface mb-4 font-(family-name:--font-manrope)">
            Payroll History
          </h2>
          <PayrollHistory records={history} branchCodes={branchCodes} />
        </section>
      </div>
    </main>
  );
}
