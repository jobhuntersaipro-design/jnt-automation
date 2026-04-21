"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

interface UnknownDispatcher {
  extId: string;
  name: string;
}

interface ConfirmSettingsCardProps {
  branchCode: string;
  month: number;
  year: number;
  knownCount?: number;
  unknownDispatchers?: UnknownDispatcher[];
  onConfirm: () => void;
  isConfirming: boolean;
  onCancel?: () => void;
  isCancelling?: boolean;
}

/** Truncate long names: keep first ~30 chars, abbreviate last word */
function truncateName(name: string, max = 30): string {
  if (name.length <= max) return name;
  const parts = name.slice(0, max).split(" ");
  if (parts.length > 1) {
    parts[parts.length - 1] = parts[parts.length - 1][0] + ".";
  }
  return parts.join(" ");
}

export function ConfirmSettingsCard({
  branchCode,
  month,
  year,
  knownCount,
  unknownDispatchers,
  onConfirm,
  isConfirming,
  onCancel,
  isCancelling,
}: ConfirmSettingsCardProps) {
  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });
  const unknownCount = unknownDispatchers?.length ?? 0;
  const totalCount = (knownCount ?? 0) + unknownCount;
  const hasCounts = knownCount != null;

  // Checkboxes for confirming new dispatcher settings
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const allConfirmed = unknownCount === 0 || confirmed.size === unknownCount;

  function toggleConfirm(extId: string) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(extId)) next.delete(extId);
      else next.add(extId);
      return next;
    });
  }

  function toggleAll() {
    if (allConfirmed) {
      setConfirmed(new Set());
    } else {
      setConfirmed(new Set(unknownDispatchers?.map((d) => d.extId)));
    }
  }

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
        {hasCounts && (
          <p className="text-[0.85rem] text-on-surface-variant mt-1">
            {totalCount} dispatcher{totalCount !== 1 ? "s" : ""} found
            {unknownCount > 0
              ? ` (${knownCount} known, ${unknownCount} new)`
              : ""}
          </p>
        )}
        <p className="text-[0.85rem] text-on-surface-variant mt-1">
          {unknownCount > 0
            ? <>Review new dispatchers on the Staff page, then confirm their settings below.</>
            : <>Please confirm staff settings are up to date for{" "}
                <span className="font-medium text-on-surface">{branchCode} &mdash; {monthName} {year}</span>.</>
          }
        </p>
      </div>

      {unknownCount > 0 && unknownDispatchers && (
        <div className="w-full max-w-lg rounded-md bg-amber-50 border border-amber-200/60 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.8rem] font-medium text-amber-800">
              Confirm settings for new dispatchers:
            </p>
            <button
              onClick={toggleAll}
              className="text-[0.72rem] font-medium text-amber-700 hover:text-amber-900 transition-colors"
            >
              {allConfirmed ? "Uncheck all" : "Check all"}
            </button>
          </div>
          <ul className="text-[0.78rem] text-amber-700 space-y-1">
            {unknownDispatchers.map((d) => (
              <li key={d.extId} className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={confirmed.has(d.extId)}
                  onChange={() => toggleConfirm(d.extId)}
                  className="w-3.5 h-3.5 rounded-sm accent-brand cursor-pointer shrink-0"
                />
                <span className={`truncate ${confirmed.has(d.extId) ? "text-amber-900 line-through opacity-60" : ""}`}>
                  {truncateName(d.name)}
                </span>
                <span className="text-amber-600/70 shrink-0">({d.extId})</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-2.5">
            <a
              href="/dispatchers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand/80 transition-colors"
            >
              Review on Staff Page
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-[0.72rem] text-amber-500">&mdash;</span>
            <p className="text-[0.72rem] text-amber-500">
              {confirmed.size}/{unknownCount} confirmed
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-1">
        <a
          href="/dispatchers"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.85rem] font-medium text-brand hover:text-brand/80 rounded-md border border-brand/20 hover:bg-brand/5 transition-colors"
        >
          Review Staff Settings
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={onConfirm}
          disabled={!allConfirmed || isConfirming || isCancelling}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.85rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors disabled:opacity-50"
        >
          {isConfirming ? "Calculating\u2026" : "Use Current Settings & Calculate \u2192"}
        </button>
      </div>
      {!allConfirmed && unknownCount > 0 && (
        <p className="text-[0.75rem] text-amber-600">
          Confirm all new dispatchers above to enable calculation
        </p>
      )}
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={isCancelling || isConfirming}
          className="text-[0.8rem] font-medium text-on-surface-variant hover:text-critical transition-colors disabled:opacity-50 mt-1"
        >
          {isCancelling ? "Cancelling\u2026" : "Cancel upload"}
        </button>
      )}
    </div>
  );
}
