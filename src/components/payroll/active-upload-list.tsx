"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { ConfirmSettingsCard } from "./confirm-settings-card";
import { ReadyToConfirm } from "./ready-to-confirm";

type UploadStatus =
  | "UPLOADING"
  | "DETECTING"
  | "PROCESSING"
  | "CONFIRM_SETTINGS"
  | "NEEDS_ATTENTION"
  | "READY_TO_CONFIRM"
  | "FAILED"
  | "SAVED"
  | "DUPLICATE";

interface UnknownDispatcher {
  extId: string;
  name: string;
}

export interface ActiveUpload {
  id: string; // unique client-side ID (before server assigns uploadId)
  uploadId?: string; // server-assigned after detect
  fileName: string;
  r2Key?: string;
  status: UploadStatus;
  uploadProgress?: number; // 0-100 for R2 upload progress
  branchCode?: string;
  month?: number;
  year?: number;
  errorMessage?: string;
  knownCount?: number;
  unknownDispatchers?: UnknownDispatcher[];
}

interface ActiveUploadListProps {
  uploads: ActiveUpload[];
  onUpdateUpload: (id: string, updates: Partial<ActiveUpload>) => void;
  onRemoveUpload: (id: string) => void;
  onUploadComplete: () => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function statusLabel(status: UploadStatus): string {
  switch (status) {
    case "UPLOADING": return "Uploading";
    case "DETECTING": return "Detecting";
    case "PROCESSING": return "Processing";
    case "CONFIRM_SETTINGS": return "Confirm settings";
    case "NEEDS_ATTENTION": return "Needs attention";
    case "READY_TO_CONFIRM": return "Ready to confirm";
    case "FAILED": return "Failed";
    case "SAVED": return "Saved";
    case "DUPLICATE": return "Duplicate";
  }
}

function UploadRow({
  upload,
  onUpdate,
  onRemove,
  onUploadComplete,
}: {
  upload: ActiveUpload;
  onUpdate: (updates: Partial<ActiveUpload>) => void;
  onRemove: () => void;
  onUploadComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(upload.status === "CONFIRM_SETTINGS" || upload.status === "NEEDS_ATTENTION" || upload.status === "READY_TO_CONFIRM");
  const prevStatusRef = useRef(upload.status);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Auto-expand when transitioning to an actionable state
  useEffect(() => {
    if (upload.status !== prevStatusRef.current) {
      prevStatusRef.current = upload.status;
      if (upload.status === "CONFIRM_SETTINGS" || upload.status === "NEEDS_ATTENTION" || upload.status === "READY_TO_CONFIRM") {
        setExpanded(true);
      }
    }
  }, [upload.status]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const monthName = upload.month ? MONTH_NAMES[upload.month - 1] : "";
  const label = upload.branchCode && upload.month
    ? `${monthName} ${upload.year} for ${upload.branchCode}`
    : upload.fileName;

  const isActive = upload.status === "PROCESSING" || upload.status === "UPLOADING" || upload.status === "DETECTING";
  const needsAction = upload.status === "CONFIRM_SETTINGS" || upload.status === "NEEDS_ATTENTION" || upload.status === "READY_TO_CONFIRM";
  const canExpand = needsAction;
  const canCancel = upload.status !== "SAVED" && upload.status !== "FAILED";

  // Poll for status changes when PROCESSING
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (upload.status === "PROCESSING" && upload.uploadId) {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/upload/${upload.uploadId}/status`);
        if (res.status === 404) {
          // Upload was deleted (replaced or cancelled) — remove from list
          onRemove();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== upload.status) {
          onUpdate({
            status: data.status,
            errorMessage: data.errorMessage,
            knownCount: data.knownCount,
            unknownDispatchers: data.unknownDispatchers,
          });
          if (data.status === "SAVED") {
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
  }, [upload.status, upload.uploadId, onUpdate, onUploadComplete]);

  const handleCancel = useCallback(async () => {
    if (!upload.uploadId) {
      // Not yet created server-side — clean up R2 if present, then remove from list
      if (upload.r2Key) {
        try {
          await fetch("/api/upload/cleanup-r2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ r2Key: upload.r2Key }),
          });
        } catch {
          // Non-fatal
        }
      }
      onRemove();
      return;
    }
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/upload/${upload.uploadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to cancel");
        return;
      }
      onRemove();
      toast.success("Upload cancelled");
    } catch {
      toast.error("Failed to cancel");
    } finally {
      setIsCancelling(false);
    }
  }, [upload.uploadId, onRemove]);

  const handleConfirmSettings = useCallback(async () => {
    if (!upload.uploadId) return;
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/upload/${upload.uploadId}/calculate`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to start calculation");
        return;
      }
      onUpdate({ status: "PROCESSING" });
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsConfirming(false);
    }
  }, [upload.uploadId, onUpdate]);

  return (
    <>
      <div className="rounded-lg bg-surface-card border border-outline-variant/15 overflow-hidden">
        {/* Row header */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Status icon */}
          {isActive && (
            <Loader2 className="w-4 h-4 text-brand animate-spin shrink-0" />
          )}
          {upload.status === "FAILED" && (
            <AlertCircle className="w-4 h-4 text-critical shrink-0" />
          )}
          {upload.status === "DUPLICATE" && (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          {upload.status === "SAVED" && (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          {needsAction && (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          )}

          {/* Label */}
          <div className="flex-1 min-w-0">
            <p className="text-[0.85rem] font-medium text-on-surface truncate">
              {isActive ? `${statusLabel(upload.status)} ${label}\u2026` : label}
            </p>
            {upload.status === "UPLOADING" && upload.uploadProgress !== undefined && (
              <div className="mt-1.5 w-full bg-outline-variant/20 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-300"
                  style={{ width: `${upload.uploadProgress}%` }}
                />
              </div>
            )}
            {upload.status === "UPLOADING" && upload.uploadProgress !== undefined && (
              <p className="text-[0.7rem] text-on-surface-variant/60 mt-0.5 tabular-nums">
                {upload.uploadProgress < 100 ? `${upload.uploadProgress}%` : "Processing\u2026"}
              </p>
            )}
            {upload.status === "FAILED" && upload.errorMessage && (
              <p className="text-[0.78rem] text-critical mt-0.5 truncate">
                {upload.errorMessage}
              </p>
            )}
            {upload.status === "SAVED" && (
              <p className="text-[0.78rem] text-emerald-600 mt-0.5">Payroll confirmed</p>
            )}
            {upload.status === "DUPLICATE" && (
              <p className="text-[0.78rem] text-amber-600 mt-0.5">Awaiting confirmation to replace</p>
            )}
            {needsAction && (
              <p className="text-[0.78rem] text-amber-600 mt-0.5">
                {statusLabel(upload.status)}
              </p>
            )}
          </div>

          {/* Expand button for actionable states */}
          {canExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Cancel / dismiss button */}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="p-1.5 text-on-surface-variant hover:text-critical rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
              title="Cancel upload"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(upload.status === "SAVED" || upload.status === "FAILED") && (
            <button
              onClick={onRemove}
              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Expanded detail */}
        {expanded && upload.uploadId && (
          <div className="border-t border-outline-variant/10 p-4">
            {upload.status === "CONFIRM_SETTINGS" && (
              <ConfirmSettingsCard
                branchCode={upload.branchCode ?? ""}
                month={upload.month ?? 1}
                year={upload.year ?? 2026}
                knownCount={upload.knownCount}
                unknownDispatchers={upload.unknownDispatchers}
                onConfirm={handleConfirmSettings}
                isConfirming={isConfirming}
                onCancel={handleCancel}
                isCancelling={isCancelling}
              />
            )}
            {upload.status === "READY_TO_CONFIRM" && (
              <ReadyToConfirm
                uploadId={upload.uploadId}
                branchCode={upload.branchCode ?? ""}
                month={upload.month ?? 1}
                year={upload.year ?? 2026}
                onConfirmed={() => {
                  onUpdate({ status: "SAVED" });
                  onUploadComplete();
                }}
                onCancel={handleCancel}
                isCancelling={isCancelling}
              />
            )}
          </div>
        )}
      </div>

    </>
  );
}

export function ActiveUploadList({
  uploads,
  onUpdateUpload,
  onRemoveUpload,
  onUploadComplete,
}: ActiveUploadListProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {uploads.map((upload) => (
        <UploadRow
          key={upload.id}
          upload={upload}
          onUpdate={(updates) => onUpdateUpload(upload.id, updates)}
          onRemove={() => onRemoveUpload(upload.id)}
          onUploadComplete={onUploadComplete}
        />
      ))}
    </div>
  );
}
