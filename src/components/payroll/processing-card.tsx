"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface ProcessingCardProps {
  branchCode: string;
  month: number;
  year: number;
  startedAt: number; // timestamp ms
  onCancel?: () => void;
  isCancelling?: boolean;
}

export function ProcessingCard({ branchCode, month, year, startedAt, onCancel, isCancelling }: ProcessingCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s} second${s !== 1 ? "s" : ""} ago`;
    const m = Math.floor(s / 60);
    return `${m} minute${m !== 1 ? "s" : ""} ago`;
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-lg bg-surface-card border border-outline-variant/15">
      <Loader2 className="w-8 h-8 text-brand animate-spin" />
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          Processing {branchCode} &mdash; {monthName} {year}
        </p>
        <p className="text-[0.85rem] text-on-surface-variant mt-1">
          Parsing delivery data&hellip;
        </p>
        <p className="text-[0.8rem] text-on-surface-variant/60 mt-1">
          Started {formatElapsed(elapsed)}
        </p>
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={isCancelling}
          className="text-[0.8rem] font-medium text-on-surface-variant hover:text-critical transition-colors disabled:opacity-50"
        >
          {isCancelling ? "Cancelling\u2026" : "Cancel"}
        </button>
      )}
    </div>
  );
}
