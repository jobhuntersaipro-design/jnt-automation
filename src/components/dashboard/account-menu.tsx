"use client";

import { useState, useRef, useCallback } from "react";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-[0.9rem] font-bold text-white shrink-0">
          A
        </div>
        <div className="flex flex-col leading-tight text-left">
          <span className="text-[0.975rem] font-semibold text-on-surface">Admin</span>
          <span className="text-[0.78rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant">
            Super Admin
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-on-surface-variant transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-[rgba(195,198,214,0.2)] z-50 py-1 overflow-hidden">
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.9rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors"
          >
            <Settings size={15} />
            Settings
          </button>
          <div className="border-t border-outline-variant/20 my-1" />
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[0.9rem] text-critical hover:bg-tertiary/5 transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
