"use client";

import { LogOut } from "lucide-react";

export function ImpersonationBanner({ agentName: initialName }: { agentName: string }) {
  async function handleExit() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    // Hard navigation to bust Router Cache
    window.location.href = "/admin";
  }

  if (!initialName) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-1.5 flex items-center justify-center gap-3 text-[0.82rem] font-medium shrink-0">
      <span>Viewing as <strong>{initialName}</strong></span>
      <button
        onClick={handleExit}
        className="flex items-center gap-1 px-2.5 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[0.75rem] font-medium transition-colors"
      >
        <LogOut size={12} />
        Exit
      </button>
    </div>
  );
}
