"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { usePayslipGuard } from "@/components/settings/use-payslip-guard";
import { BranchChip } from "@/components/ui/branch-chip";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface WeightTierSnapshot {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

interface IncentiveSnapshot {
  orderThreshold: number;
  incentiveAmount: number;
}

interface PetrolSnapshot {
  isEligible: boolean;
  dailyThreshold: number;
  subsidyAmount: number;
}

export interface HistoryRecord {
  salaryRecordId: string;
  uploadId: string;
  month: number;
  year: number;
  /** Branch that produced this salary record (via upload.branch.code) */
  branchCode: string;
  netSalary: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  totalOrders: number;
  wasRecalculated: boolean;
  weightTiersSnapshot: WeightTierSnapshot[] | null;
  incentiveSnapshot: IncentiveSnapshot | null;
  petrolSnapshot: PetrolSnapshot | null;
}

interface HistoryMonthRowProps {
  record: HistoryRecord;
  isExpanded: boolean;
  onToggle: () => void;
  dispatcherName: string;
  dispatcherId: string;
  onRecalculated: (recordId: string, newNetSalary: number) => void;
}

const DEFAULT_WEIGHT_TIERS: WeightTierSnapshot[] = [
  { tier: 1, minWeight: 0, maxWeight: 5, commission: 1.0 },
  { tier: 2, minWeight: 5.01, maxWeight: 10, commission: 1.4 },
  { tier: 3, minWeight: 10.01, maxWeight: null, commission: 2.2 },
];
const DEFAULT_INCENTIVE: IncentiveSnapshot = { orderThreshold: 2000, incentiveAmount: 0 };
const DEFAULT_PETROL: PetrolSnapshot = { isEligible: false, dailyThreshold: 70, subsidyAmount: 15 };

function formatRM(value: number): string {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type RowStatus = "confirmed" | "recalculated" | "review";

function rowStatus(r: HistoryRecord): RowStatus {
  if (r.totalOrders === 0 || r.netSalary <= 0) return "review";
  if (r.wasRecalculated) return "recalculated";
  return "confirmed";
}

function StatusPill({ status }: { status: RowStatus }) {
  const config = {
    confirmed: {
      label: "Confirmed",
      icon: CheckCircle2,
      className: "text-emerald-700 bg-emerald-50 border-emerald-200",
    },
    recalculated: {
      label: "Recalculated",
      icon: RefreshCw,
      className: "text-amber-700 bg-amber-50 border-amber-200",
    },
    review: {
      label: "Review",
      icon: AlertTriangle,
      className: "text-critical bg-red-50 border-red-200",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[0.68rem] font-medium rounded-full border ${config.className}`}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {config.label}
    </span>
  );
}

function StatChip({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
        {label}
      </span>
      <span
        className="text-[0.82rem] font-semibold tabular-nums truncate"
        style={{
          color: muted ? "var(--color-on-surface-variant)" : color ?? "var(--color-on-surface)",
          opacity: muted ? 0.4 : 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Text-based decimal input that always uses "." with optional +/- stepper */
function DecimalField({ value, onChange, className, step = 0.01, showStepper }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  step?: number;
  showStepper?: boolean;
}) {
  const [raw, setRaw] = useState(value.toString());
  const [focused, setFocused] = useState(false);

  const display = focused ? raw : value.toFixed(2);

  const nudge = (dir: 1 | -1) => {
    const next = Math.max(0, Math.round((value + dir * step) * 100) / 100);
    onChange(next);
  };

  return (
    <div className="relative group/stepper">
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          const v = e.target.value.replace(",", ".");
          if (v === "" || /^\d*\.?\d*$/.test(v)) {
            setRaw(v);
            onChange(v === "" ? 0 : parseFloat(v) || 0);
          }
        }}
        onFocus={() => { setFocused(true); setRaw(value.toString()); }}
        onBlur={() => setFocused(false)}
        className={className}
      />
      {showStepper && (
        <div className="absolute right-0 top-0 bottom-0 flex flex-col opacity-0 group-hover/stepper:opacity-100 transition-opacity">
          <button type="button" onClick={() => nudge(1)} className="flex-1 px-1 text-[0.55rem] text-on-surface-variant hover:text-brand">▲</button>
          <button type="button" onClick={() => nudge(-1)} className="flex-1 px-1 text-[0.55rem] text-on-surface-variant hover:text-brand">▼</button>
        </div>
      )}
    </div>
  );
}

/** Text-based integer input */
function IntField({ value, onChange, className }: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "");
        onChange(v === "" ? 0 : parseInt(v, 10));
      }}
      className={className}
    />
  );
}

const FIELD_CLASS = "w-20 px-2 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface transition-all caret-brand hover:bg-surface-hover/60 hover:border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand focus:bg-brand/5 focus:text-brand focus:font-semibold focus:shadow-sm";
const WEIGHT_FIELD_CLASS = "w-16 px-1.5 py-1 text-[0.78rem] tabular-nums bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface transition-all caret-brand hover:bg-surface-hover/60 hover:border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand focus:bg-brand/5 focus:text-brand focus:font-semibold focus:shadow-sm text-center";

export function HistoryMonthRow({
  record,
  isExpanded,
  onToggle,
  dispatcherName,
  dispatcherId,
  onRecalculated,
}: HistoryMonthRowProps) {
  const monthLabel = `${MONTHS[record.month]} ${record.year}`;
  const status = rowStatus(record);

  const originalTiers = record.weightTiersSnapshot ?? DEFAULT_WEIGHT_TIERS;
  const originalIncentive = record.incentiveSnapshot ?? DEFAULT_INCENTIVE;
  const originalPetrol = record.petrolSnapshot ?? DEFAULT_PETROL;

  const [tiers, setTiers] = useState<WeightTierSnapshot[]>(originalTiers);
  const [incentive, setIncentive] = useState<IncentiveSnapshot>(originalIncentive);
  const [petrol, setPetrol] = useState<PetrolSnapshot>(originalPetrol);
  const [showConfirm, setShowConfirm] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { check: checkPayslipSetup, dialog: payslipGuardDialog } = usePayslipGuard();

  // Detect changes
  const changes = useMemo(() => {
    const diffs: { field: string; from: string; to: string }[] = [];
    for (let i = 0; i < 3; i++) {
      const orig = originalTiers[i];
      const curr = tiers[i];
      if (orig && curr) {
        if (orig.minWeight !== curr.minWeight) {
          diffs.push({ field: `Tier ${i + 1} min weight`, from: `${orig.minWeight} kg`, to: `${curr.minWeight} kg` });
        }
        if (orig.maxWeight !== curr.maxWeight) {
          diffs.push({ field: `Tier ${i + 1} max weight`, from: orig.maxWeight === null ? "∞" : `${orig.maxWeight} kg`, to: curr.maxWeight === null ? "∞" : `${curr.maxWeight} kg` });
        }
        if (orig.commission !== curr.commission) {
          diffs.push({ field: `Tier ${i + 1} commission`, from: formatRM(orig.commission), to: formatRM(curr.commission) });
        }
      }
    }
    if (originalIncentive.orderThreshold !== incentive.orderThreshold) {
      diffs.push({ field: "Incentive order threshold", from: `${originalIncentive.orderThreshold}`, to: `${incentive.orderThreshold}` });
    }
    if (originalIncentive.incentiveAmount !== incentive.incentiveAmount) {
      diffs.push({ field: "Incentive amount", from: formatRM(originalIncentive.incentiveAmount), to: formatRM(incentive.incentiveAmount) });
    }
    if (originalPetrol.isEligible !== petrol.isEligible) {
      diffs.push({ field: "Petrol eligible", from: originalPetrol.isEligible ? "Yes" : "No", to: petrol.isEligible ? "Yes" : "No" });
    }
    if (originalPetrol.dailyThreshold !== petrol.dailyThreshold) {
      diffs.push({ field: "Petrol daily threshold", from: `${originalPetrol.dailyThreshold}`, to: `${petrol.dailyThreshold}` });
    }
    if (originalPetrol.subsidyAmount !== petrol.subsidyAmount) {
      diffs.push({ field: "Petrol subsidy amount", from: formatRM(originalPetrol.subsidyAmount), to: formatRM(petrol.subsidyAmount) });
    }
    return diffs;
  }, [tiers, incentive, petrol, originalTiers, originalIncentive, originalPetrol]);

  const hasChanges = changes.length > 0;

  function handleCancel() {
    setTiers(originalTiers);
    setIncentive(originalIncentive);
    setPetrol(originalPetrol);
    onToggle();
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryRecordId: record.salaryRecordId,
          updatedSnapshot: { weightTiers: tiers, incentive, petrol },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Recalculation failed");
      }

      const { updatedNetSalary } = await res.json();
      onRecalculated(record.salaryRecordId, updatedNetSalary);
      setShowConfirm(false);
      onToggle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Recalculation failed";
      const { toast } = await import("sonner");
      toast.error(message);
    } finally {
      setRecalculating(false);
    }
  }

  async function handleDownloadPayslip(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await checkPayslipSetup();
    if (!ok) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/payroll/upload/${record.uploadId}/payslips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispatcherIds: [dispatcherId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate payslip");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] || `payslip_${dispatcherId}_${record.month}_${record.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download payslip";
      const { toast } = await import("sonner");
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  }

  function updateTier(tierIndex: number, field: keyof WeightTierSnapshot, value: number | null) {
    setTiers((prev) =>
      prev.map((t, i) => (i === tierIndex ? { ...t, [field]: value } : t)),
    );
  }

  return (
    <div className="rounded-xl bg-surface-card border border-outline-variant/15 overflow-hidden">
      {/* Summary card */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full px-4 py-3 text-left hover:bg-surface-hover/40 transition-colors cursor-pointer"
      >
        {/* Top: month + branch + status + actions */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[0.9rem] font-semibold text-on-surface">{monthLabel}</span>
            {record.branchCode && (
              <BranchChip
                code={record.branchCode}
                title={`Salary from branch ${record.branchCode}`}
              />
            )}
            <StatusPill status={status} />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/dispatchers/history/${record.salaryRecordId}`, "_blank");
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded-md transition-colors"
              title="Open parcel-level detail in a new tab"
            >
              <FileText size={12} />
              Detail
            </button>
            <button
              onClick={handleDownloadPayslip}
              disabled={downloading}
              className="inline-flex items-center gap-1 px-2 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded-md transition-colors disabled:opacity-50"
              title="Download payslip PDF"
            >
              <Download size={12} />
              {downloading ? "..." : "Payslip"}
            </button>
            <ChevronDown
              size={14}
              className={`text-on-surface-variant transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3">
          <StatChip
            label="Orders"
            value={record.totalOrders.toLocaleString()}
            muted={record.totalOrders === 0}
          />
          <StatChip
            label="Base"
            value={formatRM(record.baseSalary)}
          />
          <StatChip
            label="Incentive"
            value={record.incentive > 0 ? formatRM(record.incentive) : "—"}
            color="#12B981"
            muted={record.incentive === 0}
          />
          <StatChip
            label={`Petrol${record.petrolQualifyingDays > 0 ? ` · ${record.petrolQualifyingDays}d` : ""}`}
            value={record.petrolSubsidy > 0 ? formatRM(record.petrolSubsidy) : "—"}
            color="#B27F08"
            muted={record.petrolSubsidy === 0}
          />
          <StatChip
            label="Penalty"
            value={record.penalty > 0 ? formatRM(record.penalty) : "—"}
            color="var(--color-critical)"
            muted={record.penalty === 0}
          />
          <StatChip
            label="Advance"
            value={record.advance > 0 ? formatRM(record.advance) : "—"}
            color="var(--color-critical)"
            muted={record.advance === 0}
          />
          <div className="col-span-2 flex flex-col items-end justify-end border-l border-outline-variant/20 pl-3">
            <span className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
              Net Salary
            </span>
            <span className="text-[1rem] font-bold tabular-nums text-brand">
              {formatRM(record.netSalary)}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Edit Panel */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-outline-variant/15">
          <div className="bg-surface-low rounded-[0.5rem] p-4 mt-3 space-y-5">
            <h4 className="text-[0.75rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
              {monthLabel} — Settings used
            </h4>

            {/* Weight Tiers */}
            <div>
              <label className="block text-[0.68rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-2">
                Weight Tiers
              </label>
              <div className="space-y-1.5">
                {tiers.map((t, i) => (
                  <div key={t.tier} className="flex items-center gap-2">
                    <span className="text-[0.75rem] text-on-surface-variant w-6 shrink-0">T{t.tier}</span>
                    <DecimalField
                      value={t.minWeight}
                      onChange={(v) => updateTier(i, "minWeight", v)}
                      className={WEIGHT_FIELD_CLASS}
                    />
                    <span className="text-[0.72rem] text-on-surface-variant">–</span>
                    {t.maxWeight === null ? (
                      <div className={`${WEIGHT_FIELD_CLASS} flex items-center justify-center text-on-surface-variant/50 bg-surface-low`}>∞</div>
                    ) : (
                      <DecimalField
                        value={t.maxWeight}
                        onChange={(v) => updateTier(i, "maxWeight", v)}
                        className={WEIGHT_FIELD_CLASS}
                      />
                    )}
                    <span className="text-[0.72rem] text-on-surface-variant">kg</span>
                    <span className="text-[0.75rem] text-on-surface-variant ml-2">RM</span>
                    <DecimalField
                      value={t.commission}
                      onChange={(v) => updateTier(i, "commission", v)}
                      className={FIELD_CLASS}
                      showStepper
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Incentive — green accent with toggle */}
            <div>
              <label className="block text-[0.68rem] font-medium tracking-[0.05em] uppercase mb-2" style={{ color: "#12B981" }}>
                Incentive
              </label>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-[0.75rem] text-on-surface-variant w-36">Eligible</span>
                  <button
                    onClick={() => {
                      if (incentive.orderThreshold > 0) {
                        setIncentive((prev) => ({ ...prev, orderThreshold: 0 }));
                      } else {
                        setIncentive((prev) => ({ ...prev, orderThreshold: 2000 }));
                      }
                    }}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: incentive.orderThreshold > 0 ? "#12B981" : "rgba(195, 198, 214, 0.4)" }}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        incentive.orderThreshold > 0 ? "translate-x-4" : ""
                      }`}
                    />
                  </button>
                </div>
                {incentive.orderThreshold > 0 ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.75rem] text-on-surface-variant w-36">Order threshold</span>
                      <IntField
                        value={incentive.orderThreshold}
                        onChange={(v) => setIncentive((prev) => ({ ...prev, orderThreshold: v }))}
                        className={FIELD_CLASS}
                      />
                      <span className="text-[0.72rem] text-on-surface-variant">orders/month</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.75rem] text-on-surface-variant w-36">Incentive amount</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[0.75rem] text-on-surface-variant">RM</span>
                        <DecimalField
                          value={incentive.incentiveAmount}
                          onChange={(v) => setIncentive((prev) => ({ ...prev, incentiveAmount: v }))}
                          className={FIELD_CLASS}
                          showStepper
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[0.75rem] text-on-surface-variant/50 ml-1">Incentive disabled</p>
                )}
              </div>
            </div>

            {/* Petrol Subsidy — yellow accent */}
            <div>
              <label className="block text-[0.68rem] font-medium tracking-[0.05em] uppercase mb-2" style={{ color: "#D4A017" }}>
                Petrol Subsidy
              </label>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-[0.75rem] text-on-surface-variant w-36">Eligible</span>
                  <button
                    onClick={() => setPetrol((prev) => ({ ...prev, isEligible: !prev.isEligible }))}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ backgroundColor: petrol.isEligible ? "#FBC024" : "rgba(195, 198, 214, 0.4)" }}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        petrol.isEligible ? "translate-x-4" : ""
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[0.75rem] text-on-surface-variant w-36">Daily threshold</span>
                  <IntField
                    value={petrol.dailyThreshold}
                    onChange={(v) => setPetrol((prev) => ({ ...prev, dailyThreshold: v }))}
                    className={FIELD_CLASS}
                  />
                  <span className="text-[0.72rem] text-on-surface-variant">orders/day</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[0.75rem] text-on-surface-variant w-36">Subsidy amount</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[0.75rem] text-on-surface-variant">RM</span>
                    <DecimalField
                      value={petrol.subsidyAmount}
                      onChange={(v) => setPetrol((prev) => ({ ...prev, subsidyAmount: v }))}
                      className={FIELD_CLASS}
                      showStepper
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/15">
              <button
                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowConfirm(true); }}
                disabled={!hasChanges}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Recalculate {monthLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] max-w-sm w-full mx-4">
            <h3 className="font-heading font-semibold text-[1.1rem] text-on-surface">
              Recalculate {monthLabel} for {dispatcherName}?
            </h3>
            <div className="mt-3 space-y-1.5">
              <p className="text-[0.75rem] font-medium text-on-surface-variant uppercase tracking-[0.05em]">
                Changes detected:
              </p>
              <ul className="space-y-1">
                {changes.map((c) => (
                  <li key={c.field} className="text-[0.84rem] text-on-surface">
                    <span className="text-on-surface-variant">{c.field}:</span>{" "}
                    <span className="line-through text-on-surface-variant/60">{c.from}</span>{" "}
                    <span className="font-medium">{c.to}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[0.78rem] text-on-surface-variant mt-3">
              This will update the salary record and snapshot for {monthLabel} only. Current staff settings will not be affected.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {recalculating ? "Recalculating..." : "Recalculate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payslipGuardDialog}
    </div>
  );
}
