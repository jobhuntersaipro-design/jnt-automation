"use client";

import { useState, useRef, useCallback } from "react";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { signOut } from "next-auth/react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { UserAvatar } from "@/components/ui/avatar";
import Link from "next/link";

interface AccountMenuProps {
  name: string;
  imageUrl?: string | null;
  isSuperAdmin: boolean;
}

export function AccountMenu({
  name,
  imageUrl,
  isSuperAdmin,
}: AccountMenuProps) {
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
        <UserAvatar
          name={name}
          imageUrl={imageUrl}
          size="sm"
          isSuperAdmin={isSuperAdmin}
        />
        <span className="text-[0.83rem] font-semibold text-on-surface">
          {name}
        </span>
        <ChevronDown
          size={14}
          className={`text-on-surface-variant transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-[rgba(195,198,214,0.2)] z-50 py-1 overflow-hidden">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-[0.77rem] text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors"
          >
            <Settings size={13} />
            Settings
          </Link>
          <div className="border-t border-outline-variant/20 my-1" />
          <button
            onClick={() => signOut({ redirectTo: "/auth/login?logged_out=1" })}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-[0.77rem] text-critical hover:bg-tertiary/5 transition-colors"
          >
            <LogOut size={13} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
