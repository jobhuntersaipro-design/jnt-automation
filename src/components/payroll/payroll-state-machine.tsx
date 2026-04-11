"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { UploadZone } from "./upload-zone";
import { ProcessingCard } from "./processing-card";
import { ConfirmSettingsCard } from "./confirm-settings-card";
import { FailedCard, SavedCard, UploadingCard } from "./status-cards";

type UploadState = "NONE" | "UPLOADING" | "PROCESSING" | "CONFIRM_SETTINGS" | "NEEDS_ATTENTION" | "READY_TO_CONFIRM" | "FAILED" | "SAVED";

interface UnknownDispatcher {
  extId: string;
  name: string;
}

interface UploadInfo {
  id: string;
  status: UploadState;
  errorMessage?: string | null;
  fileName?: string;
  knownCount?: number;
  unknownDispatchers?: UnknownDispatcher[];
}

interface DuplicateInfo {
  message: string;
  existingUploadId: string;
  file: File;
}

interface PayrollStateMachineProps {
  branchCode: string;
  month: number;
  year: number;
  onScrollToHistory: () => void;
  onUploadComplete: () => void;
}

export function PayrollStateMachine({
  branchCode,
  month,
  year,
  onScrollToHistory,
  onUploadComplete,
}: PayrollStateMachineProps) {
  const [state, setState] = useState<UploadState>("NONE");
  const [upload, setUpload] = useState<UploadInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingStartedAt, setProcessingStartedAt] = useState(Date.now());
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicateInfo | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current upload state for selected branch + month
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/payroll/${branchCode}/${month}/${year}`);
      if (!res.ok) return;
      const data = await res.json();
      setState(data.status as UploadState);
      if (data.upload) {
        setUpload(data.upload);
        if (data.status === "PROCESSING" && data.upload.updatedAt) {
          setProcessingStartedAt(new Date(data.upload.updatedAt).getTime());
        }
      } else {
        setUpload(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [branchCode, month, year]);

  useEffect(() => {
    setIsLoading(true);
    fetchState();
  }, [fetchState]);

  // Poll when PROCESSING or UPLOADING
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if ((state === "PROCESSING" || state === "UPLOADING") && upload?.id) {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/upload/${upload.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== state) {
          setState(data.status);
          setUpload((prev) => prev ? {
            ...prev,
            status: data.status,
            errorMessage: data.errorMessage,
            knownCount: data.knownCount,
            unknownDispatchers: data.unknownDispatchers,
          } : null);
          if (data.status === "SAVED" || data.status === "NEEDS_ATTENTION") {
            onUploadComplete();
          }
        }
      }, 2000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state, upload?.id, onUploadComplete]);

  const uploadFileAndProcess = useCallback(async (
    file: File,
    uploadId: string,
    presignedUrl: string,
  ) => {
    // Upload file to R2 via presigned URL
    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.name.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.ms-excel",
      },
    });

    if (!uploadRes.ok) {
      toast.error("Failed to upload file to storage");
      setState("NONE");
      return;
    }

    // Trigger processing
    setUpload({ id: uploadId, status: "PROCESSING" });
    setProcessingStartedAt(Date.now());

    const processRes = await fetch(`/api/upload/${uploadId}/process`, {
      method: "POST",
    });

    if (!processRes.ok) {
      const processData = await processRes.json();
      toast.error(processData.error || "Failed to start processing");
      setState("FAILED");
      setUpload({
        id: uploadId,
        status: "FAILED",
        errorMessage: processData.error || "Failed to start processing",
      });
      return;
    }

    setState("PROCESSING");
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setState("UPLOADING");

    try {
      // Init upload (get presigned URL)
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          branchCode,
          month,
          year,
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok) {
        toast.error(initData.error || "Failed to initialize upload");
        setState("NONE");
        return;
      }

      // Duplicate — show confirmation dialog instead of window.confirm
      if (initData.isDuplicate) {
        setState("NONE");
        setDuplicatePrompt({
          message: initData.message,
          existingUploadId: initData.existingUploadId,
          file,
        });
        return;
      }

      await uploadFileAndProcess(file, initData.uploadId, initData.presignedUrl);
    } catch {
      toast.error("An unexpected error occurred");
      setState("NONE");
    }
  }, [branchCode, month, year, uploadFileAndProcess]);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!duplicatePrompt) return;
    setIsReplacing(true);

    try {
      const replaceRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: duplicatePrompt.file.name,
          branchCode,
          month,
          year,
          confirmReplace: true,
          existingUploadId: duplicatePrompt.existingUploadId,
        }),
      });

      const replaceData = await replaceRes.json();
      if (!replaceRes.ok) {
        toast.error(replaceData.error || "Failed to replace upload");
        return;
      }

      setDuplicatePrompt(null);
      setState("UPLOADING");
      await uploadFileAndProcess(
        duplicatePrompt.file,
        replaceData.uploadId,
        replaceData.presignedUrl,
      );
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsReplacing(false);
    }
  }, [duplicatePrompt, branchCode, month, year, uploadFileAndProcess]);

  const handleConfirm = useCallback(async () => {
    if (!upload?.id) return;
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/upload/${upload.id}/calculate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to start calculation");
        return;
      }
      setState("PROCESSING");
      setProcessingStartedAt(Date.now());
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsConfirming(false);
    }
  }, [upload?.id]);

  const handleRetry = useCallback(async () => {
    if (!upload?.id) return;
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/upload/${upload.id}/process`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to retry");
        return;
      }
      setState("PROCESSING");
      setProcessingStartedAt(Date.now());
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsRetrying(false);
    }
  }, [upload?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Duplicate upload confirmation dialog */}
      {duplicatePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setDuplicatePrompt(null)} />
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
                onClick={() => setDuplicatePrompt(null)}
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

      {/* State machine UI */}
      {(() => {
        switch (state) {
          case "NONE":
            return (
              <UploadZone
                branchCode={branchCode}
                month={month}
                year={year}
                onFileSelected={handleFileSelected}
              />
            );

          case "UPLOADING":
            return <UploadingCard />;

          case "PROCESSING":
            return (
              <ProcessingCard
                branchCode={branchCode}
                month={month}
                year={year}
                startedAt={processingStartedAt}
              />
            );

          case "CONFIRM_SETTINGS":
            return (
              <ConfirmSettingsCard
                branchCode={branchCode}
                month={month}
                year={year}
                knownCount={upload?.knownCount}
                unknownDispatchers={upload?.unknownDispatchers}
                onConfirm={handleConfirm}
                isConfirming={isConfirming}
              />
            );

          case "FAILED":
            return (
              <FailedCard
                errorMessage={upload?.errorMessage ?? "An unknown error occurred"}
                onRetry={handleRetry}
                isRetrying={isRetrying}
              />
            );

          case "SAVED":
            return (
              <SavedCard
                month={month}
                year={year}
                onScrollToHistory={onScrollToHistory}
              />
            );

          case "NEEDS_ATTENTION":
            return (
              <SavedCard
                month={month}
                year={year}
                onScrollToHistory={onScrollToHistory}
                warning="Some dispatchers were skipped because they are not in the system. Add them on the Staff page and re-upload to include them."
              />
            );

          default:
            return (
              <div className="flex flex-col items-center justify-center gap-2 p-10 rounded-lg bg-surface-card border border-outline-variant/15">
                <p className="text-[0.85rem] text-on-surface-variant">
                  Status: {state}
                </p>
                <p className="text-[0.8rem] text-on-surface-variant/60">
                  This step will be available in a future update.
                </p>
              </div>
            );
        }
      })()}
    </>
  );
}
