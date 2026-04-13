"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Check } from "lucide-react";
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
  onCancel?: () => void;
  isCancelling?: boolean;
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

type Step = 1 | 2;

const STEPS = [
  { num: 1, label: "Preview" },
  { num: 2, label: "Confirm & Save" },
] as const;

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.7rem] font-semibold transition-colors ${
                s.num < current
                  ? "bg-emerald-100 text-emerald-700"
                  : s.num === current
                    ? "bg-brand text-white"
                    : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {s.num < current ? <Check className="w-3.5 h-3.5" /> : s.num}
            </div>
            <span
              className={`text-[0.78rem] font-medium ${
                s.num === current ? "text-on-surface" : "text-on-surface-variant"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-px mx-2 ${s.num < current ? "bg-emerald-300" : "bg-outline-variant/30"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ReadyToConfirm({
  uploadId,
  branchCode,
  month,
  year,
  onConfirmed,
  onCancel,
  isCancelling,
}: ReadyToConfirmProps) {
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

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

  // Load all data on mount
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

        const tiersMap: Record<string, WeightTierInput[]> = {};
        for (const result of previewData.results as PreviewResult[]) {
          tiersMap[result.dispatcherId] = result.weightTiersSnapshot;
        }
        setAllTiers(tiersMap);

        setResults(previewData.results);
        setSummary(previewData.summary);
        setUnknownCount(previewData.unknownDispatchers?.length ?? 0);

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
    <div className="flex flex-col gap-5">
      {/* Header with step indicator and navigation */}
      <div className="flex items-center justify-between">
        <StepIndicator current={step} />
        <div className="flex items-center gap-2">
          {step > 1 && (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>
          )}
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-1.5 text-[0.82rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-md transition-colors"
            >
              Review & Confirm →
            </button>
          )}
          {step === 2 && (
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="px-4 py-1.5 text-[0.82rem] font-medium text-white bg-critical hover:bg-critical/90 rounded-md transition-colors disabled:opacity-50"
            >
              {isConfirming ? "Saving\u2026" : "Confirm & Save Payroll"}
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Preview */}
      {step === 1 && (
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
                {unknownCount} dispatcher{unknownCount !== 1 ? "s" : ""} not in the system were skipped.
              </p>
            </div>
          )}
        </>
      )}

      {/* Step 2: Confirm & Save */}
      {step === 2 && (
        <div className="rounded-lg bg-surface-card border border-outline-variant/15 p-8">
          <div className="max-w-md mx-auto">
            <h3 className="text-[1rem] font-semibold text-on-surface text-center">
              Save payroll for {branchCode} &mdash; {monthName} {year}?
            </h3>

            <div className="mt-6 space-y-3 text-[0.85rem]">
              <div className="flex justify-between py-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Total Net Payout</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  RM {summary.totalNetPayout.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Base Salary</span>
                <span className="font-medium text-on-surface tabular-nums">
                  RM {summary.totalBaseSalary.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Incentive</span>
                <span className="font-medium text-on-surface tabular-nums">
                  RM {summary.totalIncentive.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Petrol Subsidy</span>
                <span className="font-medium text-on-surface tabular-nums">
                  RM {summary.totalPetrolSubsidy.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-outline-variant/10">
                <span className="text-on-surface-variant">Deductions</span>
                <span className="font-medium text-critical tabular-nums">
                  - RM {summary.totalDeductions.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-on-surface-variant">Dispatchers</span>
                <span className="font-medium text-on-surface">{results.length}</span>
              </div>
            </div>

            <p className="mt-6 text-[0.78rem] text-on-surface-variant/70 text-center">
              You can edit and recalculate saved payroll data at any time.
            </p>
          </div>
        </div>
      )}

      {/* Cancel upload — always visible at bottom */}
      {onCancel && (
        <div className="flex justify-center">
          <button
            onClick={onCancel}
            disabled={isCancelling || isConfirming}
            className="text-[0.8rem] font-medium text-on-surface-variant hover:text-critical transition-colors disabled:opacity-50"
          >
            {isCancelling ? "Cancelling\u2026" : "Cancel upload"}
          </button>
        </div>
      )}
    </div>
  );
}
