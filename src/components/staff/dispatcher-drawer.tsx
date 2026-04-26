"use client";

import { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { HistoryTab } from "./history-tab";
import { DispatcherAvatar } from "./dispatcher-avatar";
import type { StaffDispatcher } from "@/lib/db/staff";

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

function deriveGenderClient(icNo: string): Gender {
  const lastDigit = parseInt(icNo.slice(-1));
  if (isNaN(lastDigit)) return "UNKNOWN";
  return lastDigit % 2 !== 0 ? "MALE" : "FEMALE";
}

interface DispatcherDrawerProps {
  dispatcher: StaffDispatcher;
  onClose: () => void;
  onAvatarChange?: (dispatcherId: string, avatarUrl: string | null) => void;
}

export function DispatcherDrawer({ dispatcher, onClose, onAvatarChange }: DispatcherDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useClickOutside(drawerRef, onClose);

  const [avatarUrl, setAvatarUrl] = useState(dispatcher.avatarUrl);

  useEffect(() => {
    setAvatarUrl(dispatcher.avatarUrl);
  }, [dispatcher.avatarUrl, dispatcher.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const liveGender = deriveGenderClient(dispatcher.rawIcNo);
  const ringColor =
    liveGender === "MALE"
      ? "var(--color-brand)"
      : liveGender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";

  function handleAvatarChange(next: string | null) {
    setAvatarUrl(next);
    onAvatarChange?.(dispatcher.id, next);
  }

  return (
    <div className="fixed inset-0 z-40" data-testid="dispatcher-drawer">
      <div className="absolute inset-0 bg-on-surface/30" />
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 bottom-0 w-120 max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-outline-variant/20">
          <DispatcherAvatar
            dispatcherId={dispatcher.id}
            name={dispatcher.name}
            avatarUrl={avatarUrl}
            ringColor={ringColor}
            size="lg"
            onAvatarChange={handleAvatarChange}
          />
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface truncate uppercase">
              {dispatcher.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {dispatcher.assignments.length === 0 ? (
                <p className="text-[0.75rem] text-on-surface-variant">{dispatcher.extId}</p>
              ) : (
                dispatcher.assignments.map((a, idx) => (
                  <span
                    key={`${a.branchCode}-${a.extId}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.68rem] font-medium rounded-lg tabular-nums ${
                      idx === 0 ? "bg-brand/10 text-brand" : "bg-surface-low text-on-surface-variant"
                    }`}
                    title={idx === 0 ? "Current assignment" : "Previous assignment"}
                  >
                    <span className="font-semibold">{a.branchCode}</span>
                    <span className="opacity-70">· {a.extId}</span>
                  </span>
                ))
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover transition-colors self-start"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — hero + stats + tabs + content */}
        <div className="flex-1 px-6 py-6 overflow-y-auto">
          <HistoryTab dispatcherId={dispatcher.id} dispatcherName={dispatcher.name} />
        </div>
      </div>
    </div>
  );
}
