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
  Settings,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Circle,
  History,
} from "lucide-react";
import { PreviewSummaryCards } from "./preview-summary-cards";

export interface SalaryRecordRow {
  dispatcherId: string;
  extId: string;
  name: string;
  avatarUrl: string | null;
  icNo: string;
  totalOrders: number;
  baseSalary: number;
  incentive: number;
  petrolSubsidy: number;
  petrolQualifyingDays: number;
  penalty: number;
  advance: number;
  netSalary: number;
  weightTiersSnapshot: unknown;
  incentiveSnapshot: unknown;
  petrolSnapshot: unknown;
  wasRecalculated?: boolean;
}

interface SalaryTableProps {
  uploadId: string;
  branchCode: string;
  month: number;
  year: number;
  wasRecalculated: boolean;
  initialRecords: SalaryRecordRow[];
  initialSummary: {
    totalNetPayout: number;
    totalBaseSalary: number;
    totalIncentive: number;
    totalPetrolSubsidy: number;
    totalDeductions: number;
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type RowStatus = "ready" | "review" | "zero" | "edited";
type StatusFilter = "all" | RowStatus;

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeNet(r: SalaryRecordRow): number {
  return r.baseSalary + r.incentive + r.petrolSubsidy - r.penalty - r.advance;
}

function computeSummary(records: SalaryRecordRow[]) {
  return {
    totalNetPayout: records.reduce((s, r) => s + r.netSalary, 0),
    totalBaseSalary: records.reduce((s, r) => s + r.baseSalary, 0),
    totalIncentive: records.reduce((s, r) => s + r.incentive, 0),
    totalPetrolSubsidy: records.reduce((s, r) => s + r.petrolSubsidy, 0),
    totalDeductions: records.reduce((s, r) => s + r.penalty + r.advance, 0),
  };
}

function rowStatus(r: SalaryRecordRow, edited: boolean): RowStatus {
  if (edited) return "edited";
  if (r.totalOrders === 0) return "zero";
  if (r.netSalary <= 0) return "review";
  return "ready";
}

function StatusPill({ status }: { status: RowStatus }) {
  const config = {
    ready: {
      label: "Ready",
      icon: CheckCircle2,
      className: "text-emerald-700 bg-emerald-50 border-emerald-200",
    },
    review: {
      label: "Review",
      icon: AlertTriangle,
      className: "text-amber-700 bg-amber-50 border-amber-200",
    },
    zero: {
      label: "Zero",
      icon: Circle,
      className: "text-on-surface-variant bg-surface-low border-outline-variant/40",
    },
    edited: {
      label: "Edited",
      icon: Pencil,
      className: "text-brand bg-brand/5 border-brand/30",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.68rem] font-medium rounded-full border ${config.className}`}
    >
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {config.label}
    </span>
  );
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
      className={`w-20 px-2 py-1 text-[0.82rem] tabular-nums text-right rounded-md border bg-surface transition-colors cursor-text ${
        focused
          ? "border-brand outline-none ring-1 ring-brand/30"
          : "border-outline-variant/30"
      }`}
    />
  );
}

/**
 * Weight tier popover for the view page — view-only display of tier config.
 */
function ViewTierPopover({
  dispatcherName,
  tiers,
  onClose,
}: {
  dispatcherName: string;
  tiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }>;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute top-full right-0 mt-2 z-50 bg-white rounded-lg shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-outline-variant/20 p-4 w-64"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[0.75rem] font-semibold text-on-surface mb-2">
        Weight Tiers — {dispatcherName}
      </p>
      <div className="space-y-1.5">
        {tiers.map((tier) => (
          <div key={tier.tier} className="flex items-center gap-3">
            <span className="text-[0.72rem] font-semibold text-on-surface-variant w-6">T{tier.tier}</span>
            <span className="text-[0.72rem] text-on-surface-variant flex-1">
              {tier.minWeight}–{tier.maxWeight === null ? "∞" : tier.maxWeight}kg
            </span>
            <span className="text-[0.72rem] font-medium text-on-surface tabular-nums">
              RM {tier.commission.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SalaryTable({
  uploadId,
  branchCode,
  month,
  year,
  wasRecalculated,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [tierPopover, setTierPopover] = useState<string | null>(null);

  // Snapshot of records before edit mode for cancel/diff
  const [preEditRecords, setPreEditRecords] = useState(initialRecords);

  // Status counts (based on records, not filtered view)
  const statusCounts = useMemo(() => {
    const counts = { all: records.length, ready: 0, review: 0, zero: 0, edited: 0 };
    for (const r of records) {
      const edited = editedRecords.has(r.dispatcherId);
      const s = rowStatus(r, edited);
      counts[s]++;
    }
    return counts;
  }, [records, editedRecords]);

  // Filtered records for display
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.extId.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter !== "all") {
        const edited = editedRecords.has(r.dispatcherId);
        if (rowStatus(r, edited) !== statusFilter) return false;
      }
      return true;
    });
  }, [records, search, statusFilter, editedRecords]);

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
        incentive: r.incentive,
        petrolSubsidy: r.petrolSubsidy,
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

  const StatusFilterPill = ({
    value,
    label,
    count,
    color,
  }: {
    value: StatusFilter;
    label: string;
    count: number;
    color: string;
  }) => {
    const active = statusFilter === value;
    return (
      <button
        onClick={() => setStatusFilter(value)}
        className={`inline-flex items-center gap-1.5 px-3 py-1 text-[0.78rem] font-medium rounded-full border transition-colors ${
          active
            ? "bg-on-surface text-white border-on-surface"
            : "bg-surface-card text-on-surface-variant border-outline-variant/25 hover:bg-surface-hover"
        }`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: active ? "white" : color }}
        />
        {label}
        <span className={`tabular-nums ${active ? "text-white/75" : "text-on-surface-variant/60"}`}>
          {count}
        </span>
      </button>
    );
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[1.25rem] font-semibold text-on-surface tracking-tight">
                {branchCode} — {MONTH_NAMES[month - 1]} {year}
              </h1>
              {wasRecalculated && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[0.68rem] font-medium rounded-full bg-brand/5 text-brand border border-brand/20">
                  <History className="w-3 h-3" strokeWidth={2.5} />
                  Recalculated
                </span>
              )}
            </div>
            <p className="text-[0.78rem] text-on-surface-variant mt-0.5">
              {records.length} dispatcher{records.length !== 1 ? "s" : ""}
              {" • "}
              <span className="text-emerald-700">{statusCounts.ready} ready</span>
              {statusCounts.review > 0 && (
                <>
                  {" • "}
                  <span className="text-amber-700">{statusCounts.review} need review</span>
                </>
              )}
              {statusCounts.zero > 0 && (
                <>
                  {" • "}
                  <span className="text-on-surface-variant/60">{statusCounts.zero} zero</span>
                </>
              )}
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
                : "No changes yet — edit any incentive, petrol, penalty, or advance cell."}
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
          <StatusFilterPill value="all" label="All" count={statusCounts.all} color="#424654" />
          <StatusFilterPill value="ready" label="Ready" count={statusCounts.ready} color="#10b981" />
          {statusCounts.review > 0 && (
            <StatusFilterPill value="review" label="Review" count={statusCounts.review} color="#f59e0b" />
          )}
          {statusCounts.zero > 0 && (
            <StatusFilterPill value="zero" label="Zero" count={statusCounts.zero} color="#9ca3af" />
          )}
          {editMode && statusCounts.edited > 0 && (
            <StatusFilterPill value="edited" label="Edited" count={statusCounts.edited} color="#0056D2" />
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
                {!editMode && <th className="py-3 px-3 font-medium w-10" />}
                <th className="py-3 px-4 font-medium">Dispatcher</th>
                <th className="py-3 px-3 font-medium">Status</th>
                <th className="py-3 px-3 font-medium text-right">Orders</th>
                <th className="py-3 px-3 font-medium text-right">Base Salary</th>
                <th className="py-3 px-3 font-medium text-right" style={{ color: "#12B981" }}>Incentive</th>
                <th className="py-3 px-3 font-medium text-right" style={{ color: "#B27F08" }}>Petrol</th>
                <th className="py-3 px-3 font-medium text-right" style={{ color: "#B27F08" }}>Days</th>
                <th className="py-3 px-3 font-medium text-right text-critical">Penalty</th>
                <th className="py-3 px-3 font-medium text-right text-critical">Advance</th>
                <th className="py-3 px-4 font-medium text-right text-brand">Net Salary</th>
                <th className="py-3 px-3 font-medium text-center w-12">Tiers</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const edited = editedRecords.has(r.dispatcherId);
                const status = rowStatus(r, edited);
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
                      <p className="font-medium text-on-surface leading-tight">{r.name}</p>
                      <p className="text-[0.72rem] text-on-surface-variant/60">{r.extId}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusPill status={status} />
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
                            value={r.incentive}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "incentive", v)}
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <EditableCell
                            value={r.petrolSubsidy}
                            isAmount
                            onChange={(v) => updateField(r.dispatcherId, "petrolSubsidy", v)}
                          />
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.petrolQualifyingDays > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                          {r.petrolQualifyingDays > 0 ? r.petrolQualifyingDays : "—"}
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
                            color: r.incentive > 0 ? "#12B981" : "var(--color-on-surface-variant)",
                            opacity: r.incentive > 0 ? 1 : 0.4,
                          }}
                        >
                          {r.incentive > 0 ? formatRM(r.incentive) : "—"}
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
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.petrolQualifyingDays > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                          {r.petrolQualifyingDays > 0 ? r.petrolQualifyingDays : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.penalty > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
                          {r.penalty > 0 ? formatRM(r.penalty) : "—"}
                        </td>
                        <td className={`py-2.5 px-3 text-right tabular-nums ${r.advance > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
                          {r.advance > 0 ? formatRM(r.advance) : "—"}
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-brand">
                      {formatRM(r.netSalary)}
                    </td>
                    <td className="py-2.5 px-3 text-center relative">
                      <button
                        onClick={() => setTierPopover(tierPopover === r.dispatcherId ? null : r.dispatcherId)}
                        className="p-1.5 text-on-surface-variant/50 hover:text-brand hover:bg-brand/5 rounded-md transition-colors"
                        title="View weight tiers"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      {tierPopover === r.dispatcherId ? (
                        <ViewTierPopover
                          dispatcherName={r.name}
                          tiers={(r.weightTiersSnapshot ?? []) as Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }>}
                          onClose={() => setTierPopover(null)}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={editMode ? 11 : 12} className="py-12 text-center text-[0.85rem] text-on-surface-variant/60">
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
    </div>
  );
}
