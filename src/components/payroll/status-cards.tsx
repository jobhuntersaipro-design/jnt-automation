"use client";

import { AlertCircle, CheckCircle2, ArrowDown } from "lucide-react";

interface FailedCardProps {
  errorMessage: string;
  onRetry: () => void;
  isRetrying: boolean;
}

export function FailedCard({ errorMessage, onRetry, isRetrying }: FailedCardProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-lg bg-surface-card border border-critical/15">
      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 text-critical" />
      </div>
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          Processing failed
        </p>
        <p className="text-[0.85rem] text-on-surface-variant mt-1">
          {errorMessage}
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="px-4 py-2 text-[0.85rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors disabled:opacity-50"
      >
        {isRetrying ? "Retrying\u2026" : "Retry"}
      </button>
    </div>
  );
}

interface SavedCardProps {
  month: number;
  year: number;
  onScrollToHistory: () => void;
  warning?: string;
}

export function SavedCard({ month, year, onScrollToHistory, warning }: SavedCardProps) {
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-lg bg-surface-card border border-outline-variant/15">
      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="text-center">
        <p className="text-[0.95rem] font-semibold text-on-surface">
          {monthName} {year} payroll confirmed
        </p>
        {warning && (
          <p className="text-[0.8rem] text-amber-700 mt-1.5 max-w-md">
            {warning}
          </p>
        )}
      </div>
      <button
        onClick={onScrollToHistory}
        className="inline-flex items-center gap-1.5 text-[0.85rem] font-medium text-brand hover:text-brand/80 transition-colors"
      >
        View in history
        <ArrowDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface UploadingCardProps {
  onCancel?: () => void;
  isCancelling?: boolean;
}

export function UploadingCard({ onCancel, isCancelling }: UploadingCardProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-lg bg-surface-card border border-outline-variant/15">
      <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      <p className="text-[0.85rem] text-on-surface-variant">
        Uploading file&hellip;
      </p>
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
