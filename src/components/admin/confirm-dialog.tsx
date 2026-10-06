"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** User must type this exactly before confirming (for destructive actions). */
  requireText?: string;
  onConfirm: () => Promise<boolean | void>;
}

export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  // Unmounts on close, so typed text and busy state reset for the next request.
  return request ? <ConfirmPanel request={request} onClose={onClose} /> : null;
}

function ConfirmPanel({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const blocked = Boolean(request.requireText) && typed.trim() !== request.requireText;
  const danger = request.tone === "danger";

  async function confirm() {
    if (blocked) return;
    setBusy(true);
    const ok = await request.onConfirm();
    setBusy(false);
    if (ok !== false) onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/30" onClick={() => !busy && onClose()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md bg-surface-card rounded-xl p-6 flex flex-col gap-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.25)]"
      >
        <h3 id="confirm-title" className="text-[1rem] font-semibold text-on-surface">
          {request.title}
        </h3>
        <div className="text-[0.85rem] text-on-surface-variant leading-relaxed">{request.body}</div>
        {request.requireText && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.75rem] text-on-surface-variant">
              Type <span className="font-semibold text-on-surface">{request.requireText}</span> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
              className="px-3 py-2 text-base sm:text-[0.85rem] border border-outline-variant/40 rounded-md bg-surface text-on-surface outline-none focus:border-brand/50"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy || blocked}
            autoFocus={!request.requireText}
            className={`flex items-center gap-1.5 px-4 py-2 text-[0.82rem] font-medium text-white rounded-md transition-opacity hover:opacity-90 disabled:opacity-50 ${
              danger ? "bg-critical" : "bg-brand"
            }`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
