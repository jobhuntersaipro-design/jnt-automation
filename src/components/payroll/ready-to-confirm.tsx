"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RulesSummary } from "./rules-summary";
import { PreviewSummaryCards } from "./preview-summary-cards";
import { PreviewTable } from "./preview-table";
import type { RulesSummaryRow } from "@/lib/payroll/snapshot";
import type { WeightTierInput } from "@/lib/upload/calculator";
import type { PreviewResult } from "@/lib/upload/pipeline";

interface ReadyToConfirmProps {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  onConfirmed: () => void;
}

interface SummaryState {
  totalNetPayout: number;
  totalBaseSalary: number;
  totalIncentive: number;
  totalPetrolSubsidy: number;
  totalDeductions: number;
}

interface DispatcherNameMap {
  [dispatcherId: string]: { name: string; avatarUrl: string | null };
}

type Step = "rules" | "preview";

export function ReadyToConfirm({
  uploadId,
  branchCode,
  month,
  year,
  onConfirmed,
}: ReadyToConfirmProps) {
  const [step, setStep] = useState<Step>("rules");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Rules summary state
  const [rulesRows, setRulesRows] = useState<RulesSummaryRow[]>([]);
  const [hasPreviousData, setHasPreviousData] = useState(false);
  const [allTiers, setAllTiers] = useState<Record<string, WeightTierInput[]>>({});

  // Preview state
  const [results, setResults] = useState<PreviewResult[]>([]);
  const [summary, setSummary] = useState<SummaryState>({
    totalNetPayout: 0,
    totalBaseSalary: 0,
    totalIncentive: 0,
    totalPetrolSubsidy: 0,
    totalDeductions: 0,
  });
  const [dispatcherNames, setDispatcherNames] = useState<DispatcherNameMap>({});
  const [unknownCount, setUnknownCount] = useState(0);

  // Fetch rules summary + preview data in parallel on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [rulesRes, previewRes] = await Promise.all([
          fetch(`/api/upload/${uploadId}/rules-summary`),
          fetch(`/api/upload/${uploadId}/preview`),
        ]);

        if (!rulesRes.ok || !previewRes.ok) {
          const errorRes = !rulesRes.ok ? rulesRes : previewRes;
          const errorData = await errorRes.json();
          toast.error(errorData.error || "Failed to load data");
          return;
        }

        const rulesData = await rulesRes.json();
        const previewData = await previewRes.json();

        setRulesRows(rulesData.rows);
        setHasPreviousData(rulesData.hasPreviousData);

        // Build allTiers from rules rows — we need to fetch from the rules-summary response
        // The tiers are embedded in the preview results as snapshots
        const tiersMap: Record<string, WeightTierInput[]> = {};
        for (const result of previewData.results as PreviewResult[]) {
          tiersMap[result.dispatcherId] = result.weightTiersSnapshot;
        }
        setAllTiers(tiersMap);

        setResults(previewData.results);
        setSummary(previewData.summary);
        setUnknownCount(previewData.unknownDispatchers?.length ?? 0);

        // Build dispatcher name map from rules rows
        const nameMap: DispatcherNameMap = {};
        for (const row of rulesData.rows as RulesSummaryRow[]) {
          nameMap[row.dispatcherId] = { name: row.name, avatarUrl: null };
        }
        setDispatcherNames(nameMap);
      } catch {
        toast.error("Failed to load preview data");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [uploadId]);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/upload/${uploadId}/confirm`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save payroll");
        return;
      }

      const data = await res.json();
      toast.success(`Payroll saved — ${data.savedCount} dispatcher${data.savedCount !== 1 ? "s" : ""}`);
      onConfirmed();
    } catch {
      toast.error("Failed to save payroll");
    } finally {
      setIsConfirming(false);
      setShowConfirmDialog(false);
    }
  }, [uploadId, onConfirmed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const monthName = new Date(year, month - 1).toLocaleString("en", { month: "long" });

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Rules Summary — always visible */}
        <RulesSummary
          branchCode={branchCode}
          month={month}
          year={year}
          rows={rulesRows}
          hasPreviousData={hasPreviousData}
          allTiers={allTiers}
          onProceed={() => setStep("preview")}
        />

        {/* Preview — shown after clicking "Proceed to Preview" */}
        {step === "preview" && (
          <>
            <PreviewSummaryCards
              totalNetPayout={summary.totalNetPayout}
              totalBaseSalary={summary.totalBaseSalary}
              totalIncentive={summary.totalIncentive}
              totalPetrolSubsidy={summary.totalPetrolSubsidy}
              totalDeductions={summary.totalDeductions}
            />

            <PreviewTable
              uploadId={uploadId}
              results={results}
              dispatcherNames={dispatcherNames}
              onSummaryUpdate={setSummary}
              onResultsUpdate={setResults}
            />

            {unknownCount > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200/60 px-4 py-3">
                <p className="text-[0.8rem] text-amber-700">
                  {unknownCount} dispatcher{unknownCount !== 1 ? "s" : ""} not in the system will be skipped.
                  Add them on the Staff page and re-upload to include them.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setShowConfirmDialog(true)}
                className="px-5 py-2.5 text-[0.85rem] font-medium text-white bg-critical hover:bg-critical/90 rounded-md transition-colors"
              >
                Confirm &amp; Save Payroll
              </button>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-on-surface/40"
            onClick={() => !isConfirming && setShowConfirmDialog(false)}
          />
          <div className="relative bg-surface-card rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-[0.95rem] font-semibold text-on-surface">
              Save payroll for {branchCode} &mdash; {monthName} {year}?
            </h3>
            <div className="mt-4 space-y-2 text-[0.85rem] text-on-surface-variant">
              <div className="flex justify-between">
                <span>Total Net Payout:</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  RM {summary.totalNetPayout.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Dispatchers:</span>
                <span className="font-medium text-on-surface">{results.length}</span>
              </div>
              {rulesRows.some((r) => r.changes.some((c) => c.type === "NEW")) && (
                <div className="flex justify-between">
                  <span>New this month:</span>
                  <span className="font-medium text-on-surface">
                    {rulesRows.filter((r) => r.changes.some((c) => c.type === "NEW")).length}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-4 text-[0.78rem] text-on-surface-variant/70">
              Salary rules will be locked at current settings.
              This cannot be undone without re-uploading.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={isConfirming}
                className="px-4 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className="px-4 py-2 text-[0.82rem] font-medium text-white bg-critical hover:bg-critical/90 rounded-md transition-colors disabled:opacity-50"
              >
                {isConfirming ? "Saving\u2026" : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
