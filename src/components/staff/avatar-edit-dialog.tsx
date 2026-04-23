"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Upload, Trash, X, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_AVATARS,
  getDefaultAvatarById,
  isDefaultAvatarUrl,
} from "@/lib/avatar/default-avatars";

const AVATAR_ACCEPTED = ".jpg,.jpeg,.png,.webp";
const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

interface AvatarEditDialogProps {
  open: boolean;
  dispatcherId: string;
  dispatcherName: string;
  avatarUrl: string | null;
  ringColor: string;
  onClose: () => void;
  onAvatarChange: (avatarUrl: string | null) => void;
}

type PendingConfirm =
  | { kind: "remove" }
  | { kind: "upload"; file: File }
  | { kind: "pick-default"; defaultId: string };

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function AvatarEditDialog({
  open,
  dispatcherId,
  dispatcherName,
  avatarUrl,
  ringColor,
  onClose,
  onAvatarChange,
}: AvatarEditDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove" | string>(null);
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null);
  const initials = getInitials(dispatcherName);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset confirm state when the dialog closes
  useEffect(() => {
    if (!open) setConfirmState(null);
  }, [open]);

  // Escape — close the confirm first if open, otherwise close the dialog
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || busy) return;
      if (confirmState) {
        setConfirmState(null);
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, confirmState, onClose]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  // ── Upload ────────────────────────────────────────────────────────────────

  async function executeUpload(file: File) {
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/staff/${dispatcherId}/avatar`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Upload failed");
        return;
      }
      const { avatarUrl: newUrl } = await res.json();
      onAvatarChange(newUrl);
      toast.success("Photo updated");
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(null);
    }
  }

  function handleUploadSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG, and WebP files are allowed");
      return;
    }
    if (file.size > AVATAR_MAX_SIZE) {
      toast.error("File must be under 2MB");
      return;
    }
    if (avatarUrl) {
      setConfirmState({ kind: "upload", file });
      return;
    }
    executeUpload(file);
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async function executeRemove() {
    setBusy("remove");
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/avatar`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onAvatarChange(null);
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setBusy(null);
    }
  }

  function handleRemoveClick() {
    if (!avatarUrl) return;
    setConfirmState({ kind: "remove" });
  }

  // ── Pick default ──────────────────────────────────────────────────────────

  async function executePickDefault(defaultId: string) {
    setBusy(defaultId);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/avatar/default`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to set avatar");
        return;
      }
      const { avatarUrl: newUrl } = await res.json();
      onAvatarChange(newUrl);
      toast.success("Avatar updated");
    } catch {
      toast.error("Failed to set avatar");
    } finally {
      setBusy(null);
    }
  }

  function handlePickDefault(defaultId: string) {
    const picked = getDefaultAvatarById(defaultId);
    if (!picked) return;
    if (avatarUrl === picked.url) return; // already using this one — no-op
    if (avatarUrl) {
      setConfirmState({ kind: "pick-default", defaultId });
      return;
    }
    executePickDefault(defaultId);
  }

  // ── Confirm execution ─────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!confirmState) return;
    const action = confirmState;
    setConfirmState(null);
    if (action.kind === "remove") await executeRemove();
    else if (action.kind === "upload") await executeUpload(action.file);
    else await executePickDefault(action.defaultId);
  }

  // ── Confirm copy ──────────────────────────────────────────────────────────

  const confirmCopy = confirmState ? getConfirmCopy(confirmState) : null;

  const hasPhoto = !!avatarUrl;
  const usingDefault = isDefaultAvatarUrl(avatarUrl);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/50 backdrop-blur-sm animate-in fade-in duration-150 p-4"
      onClick={() => !busy && !confirmState && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Edit avatar"
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-[0_12px_40px_-12px_rgba(25,28,29,0.25)] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/15">
          <h2 className="font-heading font-semibold text-[1rem] text-on-surface">Edit avatar</h2>
          <button
            type="button"
            onClick={() => !busy && !confirmState && onClose()}
            disabled={!!busy || !!confirmState}
            className="p-1.5 rounded-md text-on-surface-variant hover:bg-surface-hover transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview + primary actions */}
        <div className="flex flex-col items-center gap-4 px-6 py-5">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center bg-surface-low text-2xl font-semibold text-on-surface-variant overflow-hidden"
            style={{ outline: `3px solid ${ringColor}`, outlineOffset: "3px" }}
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={dispatcherName}
                width={112}
                height={112}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              initials
            )}
          </div>

          <p className="text-[0.72rem] text-on-surface-variant/80">
            {usingDefault
              ? "Using a default avatar"
              : hasPhoto
                ? "Custom photo"
                : "No photo — showing initials"}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!busy || !!confirmState}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[0.8rem] font-medium bg-brand text-white rounded-md hover:bg-brand/90 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {busy === "upload" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {hasPhoto ? "Change photo" : "Upload photo"}
            </button>
            {hasPhoto && (
              <button
                type="button"
                onClick={handleRemoveClick}
                disabled={!!busy || !!confirmState}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[0.8rem] font-medium text-on-surface-variant border border-outline-variant/40 rounded-md hover:bg-surface-hover hover:text-critical hover:border-critical/40 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {busy === "remove" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash size={14} />
                )}
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPTED}
            onChange={handleUploadSelect}
            className="hidden"
          />
          <p className="text-[0.66rem] text-on-surface-variant/60">JPG, PNG, or WebP · max 2MB</p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-6">
          <div className="flex-1 h-px bg-outline-variant/30" />
          <span className="text-[0.66rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
            Or pick a default
          </span>
          <div className="flex-1 h-px bg-outline-variant/30" />
        </div>

        {/* Default avatar grid */}
        <div className="grid grid-cols-6 gap-2 px-6 py-5">
          {DEFAULT_AVATARS.map((a) => {
            const isActive = avatarUrl === a.url;
            const isBusy = busy === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handlePickDefault(a.id)}
                disabled={!!busy || !!confirmState}
                aria-label={`Use default avatar ${a.id}`}
                aria-pressed={isActive}
                className={`relative aspect-square rounded-full overflow-hidden bg-surface-low cursor-pointer transition-all disabled:cursor-not-allowed ${
                  isActive
                    ? "outline-2 outline-brand outline-offset-2"
                    : "hover:outline-2 hover:outline-outline-variant hover:outline-offset-2"
                }`}
              >
                <Image
                  src={a.url}
                  alt=""
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  unoptimized
                />
                {isActive && !isBusy && (
                  <div className="absolute inset-0 bg-brand/20 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center shadow">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                )}
                {isBusy && (
                  <div className="absolute inset-0 bg-on-surface/40 flex items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Confirm overlay (nested — covers the dialog only) */}
        {confirmState && confirmCopy && (
          <div
            className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-on-surface/20 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={() => setConfirmState(null)}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="avatar-confirm-title"
            aria-describedby="avatar-confirm-body"
          >
            <div
              className="w-full sm:w-[22rem] bg-white rounded-t-2xl sm:rounded-xl shadow-[0_-8px_32px_-12px_rgba(25,28,29,0.15)] sm:shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] p-5 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "rgba(148, 0, 2, 0.08)", color: "var(--color-critical)" }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    id="avatar-confirm-title"
                    className="font-heading font-semibold text-[0.95rem] text-on-surface"
                  >
                    {confirmCopy.title}
                  </h3>
                  <p
                    id="avatar-confirm-body"
                    className="text-[0.8rem] text-on-surface-variant mt-1"
                  >
                    {confirmCopy.body}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmState(null)}
                  className="px-3.5 py-2 text-[0.8rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[0.8rem] font-medium text-white rounded-md transition-colors cursor-pointer ${
                    confirmCopy.tone === "critical" ? "bg-critical hover:opacity-90" : "bg-brand hover:bg-brand/90"
                  }`}
                  autoFocus
                >
                  {confirmCopy.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function getConfirmCopy(state: PendingConfirm): {
  title: string;
  body: string;
  confirmLabel: string;
  tone: "critical" | "brand";
} {
  if (state.kind === "remove") {
    return {
      title: "Remove this photo?",
      body: "The current avatar will be removed and the dispatcher will show their initials.",
      confirmLabel: "Remove",
      tone: "critical",
    };
  }
  if (state.kind === "upload") {
    return {
      title: "Replace current avatar?",
      body: `The current avatar will be replaced with "${state.file.name}".`,
      confirmLabel: "Replace",
      tone: "brand",
    };
  }
  return {
    title: "Replace current avatar?",
    body: "The current avatar will be replaced with the default you picked.",
    confirmLabel: "Replace",
    tone: "brand",
  };
}
