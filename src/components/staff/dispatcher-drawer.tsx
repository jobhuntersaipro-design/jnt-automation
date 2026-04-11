"use client";

import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { HistoryTab } from "./history-tab";
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
}

export function DispatcherDrawer({ dispatcher, onClose }: DispatcherDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useClickOutside(drawerRef, onClose);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
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

  const initials = dispatcher.name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-on-surface/30" />
      <div
        ref={drawerRef}
        className="absolute right-0 top-0 bottom-0 w-120 max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/20">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-low text-[0.84rem] font-semibold text-on-surface-variant shrink-0 overflow-hidden"
            style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
          >
            {dispatcher.avatarUrl ? (
              <img src={dispatcher.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface truncate">{dispatcher.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[0.75rem] text-on-surface-variant">{dispatcher.extId}</p>
              <span className="inline-block px-1.5 py-0.5 text-[0.68rem] font-medium text-on-surface-variant bg-surface-low rounded-lg">
                {dispatcher.branchCode}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body — History only */}
        <div className="flex-1 px-6 py-6 overflow-y-auto">
          <HistoryTab dispatcherId={dispatcher.id} dispatcherName={dispatcher.name} />
        </div>
      </div>
    </div>
  );
}
