"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  X,
  Search,
  Info,
  Download,
  FileText,
  TrendingUp,
} from "lucide-react";
import { PreviewSummaryCards } from "./preview-summary-cards";
import { usePayslipGuard } from "@/components/settings/use-payslip-guard";
import { readBonusTierSnapshot } from "@/lib/staff/bonus-tier-snapshot";

export interface SalaryRecordRow {
  dispatcherId: string;
  extId: string;
  name: string;
  avatarUrl: string | null;
  icNo: string | null;
  totalOrders: number;
  baseSalary: number;
  bonusTierEarnings: number;
  petrolSubsidy: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
  bonusTierSnapshot: unknown;
}

interface SalaryTableProps {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  initialRecords: SalaryRecordRow[];
  initialSummary: {
    totalNetPayout: number;
    totalBaseSalary: number;
    totalPetrolSubsidy: number;
    totalCommission: number;
    totalDeductions: number;
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeNet(r: SalaryRecordRow): number {
  return (
    r.baseSalary +
    r.bonusTierEarnings +
    r.petrolSubsidy +
    r.commission -
    r.penalty -
    r.advance
  );
}

/**
 * Read the bonusTierEarnings order threshold from a snapshot (works for both legacy
 * and new-shape snapshots). Returns null if the record has no threshold set.
 */
function getOrderThreshold(snapshot: unknown): number | null {
  try {
    const read = readBonusTierSnapshot(snapshot);
    if (!read || read.orderThreshold <= 0) return null;
    return read.orderThreshold;
  } catch {
    return null;
  }
}

function isHighPerformer(r: SalaryRecordRow): boolean {
  const threshold = getOrderThreshold(r.bonusTierSnapshot);
  if (threshold === null) return false;
  return r.totalOrders > threshold;
}

function computeSummary(records: SalaryRecordRow[]) {
  return {
    totalNetPayout: records.reduce((s, r) => s + r.netSalary, 0),
    // "Base Salary" in the summary = default-tier + bonus-tier earnings combined.
    // The per-row table breaks these back out under a grouped Base Salary header.
    totalBaseSalary: records.reduce(
      (s, r) => s + r.baseSalary + r.bonusTierEarnings,
      0,
    ),
    totalPetrolSubsidy: records.reduce((s, r) => s + r.petrolSubsidy, 0),
    totalCommission: records.reduce((s, r) => s + r.commission, 0),
    totalDeductions: records.reduce((s, r) => s + r.penalty + r.advance, 0),
  };
}

/**
 * Calculator-style numeric input for edit mode fields.
 */
function EditableCell({
  value,
  onChange,
  isAmount,
}: {
  value: number;
  onChange: (val: number) => void;
  isAmount?: boolean;
}) {
  const [cents, setCents] = useState(Math.round(value * (isAmount ? 100 : 1)));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = isAmount ? (cents / 100).toFixed(2) : String(cents);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const next = Math.min(cents * 10 + parseInt(e.key), 9_999_999);
        setCents(next);
        onChange(isAmount ? Math.round(next) / 100 : next);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        const next = Math.floor(cents / 10);
        setCents(next);
        onChange(isAmount ? Math.round(next) / 100 : next);
      } else if (e.key === "Enter") {
        inputRef.current?.blur();
      }
    },
    [cents, isAmount, onChange],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      readOnly
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`w-20 px-2 py-1 text-[0.82rem] tabular-nums text-right rounded-md border bg-surface transition-all cursor-text ${
        focused
          ? "border-brand outline-none ring-2 ring-brand/30 bg-brand/5 text-brand font-semibold shadow-sm"
          : "border-outline-variant/30 hover:border-outline-variant/60 hover:bg-surface-hover/40"
      }`}
    />
  );
}

export function SalaryTable({
  uploadId,
  branchCode,
  month,
  year,
  initialRecords,
  initialSummary,
}: SalaryTableProps) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [summary, setSummary] = useState(initialSummary);
  const [editMode, setEditMode] = useState(false);
  const [editedRecords, setEditedRecords] = useState<Map<string, SalaryRecordRow>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [highPerformerOnly, setHighPerformerOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [hpInfoOpen, setHpInfoOpen] = useState(false);
  const hpInfoRef = useRef<HTMLDivElement>(null);
  const { check: checkPayslipSetup, dialog: payslipGuardDialog } = usePayslipGuard();

  useEffect(() => {
    if (!hpInfoOpen) return;
    function handleClick(e: MouseEvent) {
      if (hpInfoRef.current && !hpInfoRef.current.contains(e.target as Node)) {
        setHpInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [hpInfoOpen]);

  // Snapshot of records before edit mode for cancel/diff
  const [preEditRecords, setPreEditRecords] = useState(initialRecords);

  // Counts for the remaining filter pills.
  const counts = useMemo(() => {
    let highPerformer = 0;
    for (const r of records) {
      if (isHighPerformer(r)) highPerformer++;
    }
    return { all: records.length, highPerformer };
  }, [records]);

  // Filtered records for display
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.extId.toLowerCase().includes(q)) {
        return false;
      }
      if (highPerformerOnly && !isHighPerformer(r)) return false;
      return true;
    });
  }, [records, search, highPerformerOnly]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.dispatcherId));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of filtered) next.delete(r.dispatcherId);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of filtered) next.add(r.dispatcherId);
        return next;
      });
    }
  };

  // Enter edit mode
  const startEdit = () => {
    setPreEditRecords([...records]);
    setEditedRecords(new Map());
    setEditMode(true);
  };

  // Cancel edit mode
  const cancelEdit = () => {
    setRecords(preEditRecords);
    setSummary(computeSummary(preEditRecords));
    setEditedRecords(new Map());
    setEditMode(false);
  };

  // Update a field in edit mode
  const updateField = useCallback(
    (dispatcherId: string, field: keyof SalaryRecordRow, value: number) => {
      setRecords((prev) => {
        const updated = prev.map((r) => {
          if (r.dispatcherId !== dispatcherId) return r;
          const patched = { ...r, [field]: value };
          patched.netSalary = computeNet(patched);
          return patched;
        });
        setSummary(computeSummary(updated));

        // Track which records changed
        const changed = updated.find((r) => r.dispatcherId === dispatcherId);
        if (changed) {
          setEditedRecords((prev) => {
            const next = new Map(prev);
            next.set(dispatcherId, changed);
            return next;
          });
        }

        return updated;
      });
    },
    [],
  );

  // Count modified records
  const modifiedCount = editedRecords.size;
  const preEditSummary = computeSummary(preEditRecords);

  // Save & Regenerate
  const handleSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    try {
      const updates = Array.from(editedRecords.values()).map((r) => ({
        dispatcherId: r.dispatcherId,
        totalOrders: r.totalOrders,
        baseSalary: r.baseSalary,
        bonusTierEarnings: r.bonusTierEarnings,
        petrolSubsidy: r.petrolSubsidy,
        commission: r.commission,
        penalty: r.penalty,
        advance: r.advance,
      }));

      const res = await fetch(`/api/payroll/upload/${uploadId}/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return;
      }

      setEditMode(false);
      setEditedRecords(new Map());
      toast.success(`${MONTH_NAMES[month - 1]} ${year} payroll updated`);
      router.refresh();
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // Generate payslips
  const handleGeneratePayslips = async () => {
    if (selectedIds.size === 0) return;
    const ok = await checkPayslipSetup();
    if (!ok) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/payroll/upload/${uploadId}/payslips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dispatcherIds: Array.from(selectedIds) }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to generate payslips");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const monthStr = String(month).padStart(2, "0");
      a.download = filenameMatch?.[1] || `payslips_${branchCode}_${monthStr}_${year}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Payslips downloaded");
    } catch {
      toast.error("Failed to generate payslips");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCsv = () => {
    setExportingCsv(true);
    // Use anchor download so Chrome treats it as a file, not a tab
    window.location.href = `/api/payroll/upload/${uploadId}/export/csv`;
    // Reset state after brief delay (download is fire-and-forget)
    setTimeout(() => setExportingCsv(false), 1500);
  };

  const handleExportPdf = () => {
    setExportingPdf(true);
    window.location.href = `/api/payroll/upload/${uploadId}/export/pdf`;
    setTimeout(() => setExportingPdf(false), 1500);
  };

  return (
    <div className="flex flex-col gap-5 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dispatchers?tab=payroll"
            className="p-1.5 rounded-md hover:bg-surface-hover transition-colors text-on-surface-variant"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-[1.25rem] font-semibold text-on-surface tracking-tight">
              {branchCode} — {MONTH_NAMES[month - 1]} {year}
            </h1>
            <p className="text-[0.78rem] text-on-surface-variant mt-0.5">
              {records.length} dispatcher{records.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[0.82rem] text-amber-800">
          <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span className="font-medium">Edit mode</span>
          <span className="text-amber-700/80">— changes will update salary records and snapshots. Payslips will reflect the new values after saving.</span>
        </div>
      )}

      {/* Summary Cards — semantic variant */}
      <PreviewSummaryCards
        {...summary}
        variant="semantic"
        heroSubtitle={`${records.length} dispatcher${records.length !== 1 ? "s" : ""} · ${MONTH_NAMES[month - 1]} ${year}`}
      />

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-surface-card border border-outline-variant/15">
        {editMode ? (
          <>
            <div className="flex-1 text-[0.82rem] text-on-surface-variant">
              {modifiedCount > 0
                ? `${modifiedCount} dispatcher${modifiedCount !== 1 ? "s" : ""} modified`
                : "No changes yet — edit any bonus tier, petrol, commission, penalty, or advance cell."}
            </div>
            <button
              onClick={cancelEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface-variant border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={modifiedCount === 0 || saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : `Save & Regenerate (${modifiedCount})`}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exportingCsv ? "Downloading..." : "Download CSV"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              {exportingPdf ? "Downloading..." : "Download PDF"}
            </button>
            <button
              onClick={handleGeneratePayslips}
              disabled={selectedIds.size === 0 || generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-on-surface border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={selectedIds.size === 0 ? "Select dispatchers below to enable" : undefined}
            >
              <FileText className="w-3.5 h-3.5" />
              {generating
                ? "Generating..."
                : selectedIds.size > 0
                ? `Generate Payslips (${selectedIds.size})`
                : "Generate Payslips"}
            </button>
            <div className="flex-1" />
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium text-brand border border-brand/30 rounded-md hover:bg-brand/5 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit & Recalculate
            </button>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/50" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[0.78rem] font-medium rounded-full border bg-on-surface text-white border-on-surface">
            All
            <span className="tabular-nums text-white/75">{counts.all}</span>
          </span>
          {counts.highPerformer > 0 && (
            <>
              <span className="mx-1 text-outline-variant/60">·</span>
              <button
                type="button"
                onClick={() => setHighPerformerOnly((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.76rem] font-medium rounded-md border transition-colors ${
                  highPerformerOnly
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                High Performers
                <span
                  className={`ml-0.5 px-1.5 py-0 text-[0.72rem] tabular-nums rounded-md ${
                    highPerformerOnly ? "bg-white/20" : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {counts.highPerformer}
                </span>
              </button>
              <div ref={hpInfoRef} className="relative">
                <button
                  type="button"
                  onClick={() => setHpInfoOpen((v) => !v)}
                  aria-label="What is a High Performer?"
                  aria-expanded={hpInfoOpen}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-on-surface-variant/60 hover:text-brand hover:bg-brand/5 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
                {hpInfoOpen && (
                  <div
                    role="tooltip"
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-50 w-64 p-3 rounded-md bg-on-surface text-white text-[0.72rem] leading-snug shadow-[0_8px_24px_-8px_rgba(25,28,29,0.3)]"
                  >
                    A <span className="font-semibold">High Performer</span> is a dispatcher whose
                    monthly orders crossed their bonus tier threshold. Parcels past that threshold
                    earn the higher bonus-tier rate instead of the default rate.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {!editMode && (
          <label className="flex items-center gap-2 text-[0.78rem] text-on-surface-variant cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="rounded accent-brand"
            />
            Select All
          </label>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-surface-card border border-outline-variant/15 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant bg-surface-low">
                {!editMode && <th rowSpan={2} className="py-2 px-3 font-medium w-10 align-bottom" />}
                <th rowSpan={2} className="py-2 px-4 font-medium align-bottom">Dispatcher</th>
                <th rowSpan={2} className="py-2 px-3 font-medium text-right align-bottom">Orders</th>
                <th
                  colSpan={2}
                  className="pt-2 pb-0.5 px-3 font-semibold text-center border-b border-outline-variant/15"
                >
                  Base Salary
                </th>
                <th rowSpan={2} className="py-2 px-3 font-medium text-right align-bottom" style={{ color: "#B27F08" }}>Petrol</th>
                <th rowSpan={2} className="py-2 px-3 font-medium text-right align-bottom text-critical">Penalty</th>
                <th rowSpan={2} className="py-2 px-3 font-medium text-right align-bottom text-critical">Advance</th>
                <th rowSpan={2} className="py-2 px-3 font-medium text-right align-bottom" style={{ color: "#12B981" }}>Commission</th>
                <th rowSpan={2} className="py-2 px-4 font-medium text-right align-bottom text-brand">Net Salary</th>
              </tr>
              <tr className="text-left text-[0.68rem] uppercase tracking-wider text-on-surface-variant/70 bg-surface-low">
                <th className="pt-0.5 pb-2 px-3 font-medium text-right">Default Tier</th>
                <th className="pt-0.5 pb-2 px-3 font-medium text-right" style={{ color: "#12B981" }}>Bonus Tier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                return (
                  <tr
                    key={r.dispatcherId}
                    className="border-t border-outline-variant/8 hover:bg-surface-hover/40 transition-colors"
                  >
                    {!editMode && (
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.dispatcherId)}
                          onChange={() => toggleSelect(r.dispatcherId)}
                          className="rounded accent-brand"
                        />
                      </td>
                    )}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-on-surface leading-tight">{r.name}</p>
                        {isHighPerformer(r) && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.64rem] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md"
                            title={`Dispatched over ${(getOrderThreshold(r.bonusTierSnapshot) ?? 0).toLocaleString()} orders`}
                          >
                            <TrendingUp className="w-3 h-3" />
                            High Performer
                          </span>
                        )}
                      </div>
                      <p className="text-[0.72rem] text-on-surface-variant/60">{r.extId}</p>
                    </td>
                    {editMode ? (
                      <>
                        <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                          {r.totalOrders.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                          {formatRM(r.baseSalary)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.bonusTierEarnings}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "bonusTierEarnings", v)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.petrolSubsidy}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "petrolSubsidy", v)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.penalty}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "penalty", v)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.advance}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "advance", v)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.commission}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "commission", v)}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                          {r.totalOrders.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-on-surface">
                          {formatRM(r.baseSalary)}
                        </td>
                        <td
                          className="py-2.5 px-3 text-right tabular-nums"
                          style={{
                            color: r.bonusTierEarnings > 0 ? "#12B981" : "var(--color-on-surface-variant)",
                            opacity: r.bonusTierEarnings > 0 ? 1 : 0.4,
                          }}
                        >
                          {r.bonusTierEarnings > 0 ? formatRM(r.bonusTierEarnings) : "—"}
                        </td>
                        <td
                          className="py-2.5 px-3 text-right tabular-nums"
                          style={{
                            color: r.petrolSubsidy > 0 ? "#B27F08" : "var(--color-on-surface-variant)",
                            opacity: r.petrolSubsidy > 0 ? 1 : 0.4,
                          }}
                        >
                          {r.petrolSubsidy > 0 ? formatRM(r.petrolSubsidy) : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.penalty > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
                          {r.penalty > 0 ? formatRM(r.penalty) : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.advance > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
                          {r.advance > 0 ? formatRM(r.advance) : "—"}
                        </td>
                        <td
                          className="py-2.5 px-3 text-right tabular-nums"
                          style={{
                            color: r.commission > 0 ? "#12B981" : "var(--color-on-surface-variant)",
                            opacity: r.commission > 0 ? 1 : 0.4,
                          }}
                        >
                          {r.commission > 0 ? formatRM(r.commission) : "—"}
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-brand">
                      {formatRM(r.netSalary)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={editMode ? 9 : 10} className="py-12 text-center text-[0.85rem] text-on-surface-variant/60">
                    {records.length === 0
                      ? "No dispatchers in this payroll."
                      : "No dispatchers match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip floating action bar */}
      {!editMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-5 py-3 rounded-xl bg-surface-card border border-outline-variant/20 shadow-lg">
          <span className="text-[0.82rem] font-medium text-on-surface">
            {selectedIds.size} dispatcher{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleGeneratePayslips}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            {generating ? "Generating..." : "Generate Payslips"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[0.78rem] text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowConfirm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-surface-card rounded-xl border border-outline-variant/20 shadow-xl p-6">
            <h3 className="text-[1rem] font-semibold text-on-surface">
              Save changes for {branchCode} — {MONTH_NAMES[month - 1]} {year}?
            </h3>
            <div className="mt-3 text-[0.85rem] text-on-surface-variant space-y-1.5">
              <p>{modifiedCount} dispatcher{modifiedCount !== 1 ? "s" : ""} modified.</p>
              <p>
                Total Net Payout:{" "}
                <span className="font-semibold text-on-surface">RM {formatRM(summary.totalNetPayout)}</span>
                {" "}
                <span className="text-on-surface-variant/60">
                  (was RM {formatRM(preEditSummary.totalNetPayout)})
                </span>
              </p>
            </div>
            <p className="mt-3 text-[0.78rem] text-on-surface-variant/70">
              This will update salary records and snapshots. Payslips will reflect the new values.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-1.5 text-[0.82rem] font-medium text-on-surface-variant border border-outline-variant/30 rounded-md hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-[0.82rem] font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Regenerate"}
              </button>
            </div>
          </div>
        </>
      )}

      {payslipGuardDialog}
    </div>
  );
}
