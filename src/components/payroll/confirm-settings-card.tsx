"use client";

import { ExternalLink } from "lucide-react";

interface ConfirmSettingsCardProps {
  branchCode: string;
  month: number;
  year: number;
  uploadId: string;
  onConfirm: () => void;
  isConfirming: boolean;
}

export function ConfirmSettingsCard({
  branchCode,
  month,
  year,
  uploadId: _uploadId,
  onConfirm,
  isConfirming,
}: ConfirmSettingsCardProps) {
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 rounded-lg bg-surface-card border border-outline-variant/15">
      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          File parsed successfully
        </p>
        <p className="text-[0.85rem] text-on-surface-variant mt-1">
          Before calculating salaries, please confirm staff settings are up to date for{" "}
          <span className="font-medium text-on-surface">{branchCode} &mdash; {monthName} {year}</span>.
        </p>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <a
          href="/staff"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.85rem] font-medium text-brand hover:text-brand/80 rounded-md border border-brand/20 hover:bg-brand/5 transition-colors"
        >
          Review Staff Settings
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.85rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors disabled:opacity-50"
        >
          {isConfirming ? "Calculating\u2026" : "Use Current Settings & Calculate \u2192"}
        </button>
      </div>
    </div>
  );
}
