"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil, X, Search } from "lucide-react";
import { PreviewSummaryCards } from "./preview-summary-cards";
import { ExportButtons } from "./export-buttons";

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
  penalty: number;
  advance: number;
  netSalary: number;
  weightTiersSnapshot: unknown;
  incentiveSnapshot: unknown;
  petrolSnapshot: unknown;
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
    totalIncentive: number;
    totalPetrolSubsidy: number;
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
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Snapshot of records before edit mode for cancel/diff
  const [preEditRecords, setPreEditRecords] = useState(initialRecords);

  // Filtered records for display
  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(
      (r) => r.name.toLowerCase().includes(q) || r.extId.toLowerCase().includes(q),
    );
  }, [records, search]);

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
      // Extract filename from Content-Disposition header, fallback to .zip
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

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/payroll"
            className="p-1.5 rounded-md hover:bg-surface-hover transition-colors text-on-surface-variant"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-[1.25rem] font-semibold text-on-surface tracking-tight">
              {branchCode} — {MONTH_NAMES[month - 1]} {year}
            </h1>
            <p className="text-[0.78rem] text-on-surface-variant">
              {records.length} dispatcher{records.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
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
              <ExportButtons uploadId={uploadId} />
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
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-[0.82rem] text-amber-800">
          <span className="font-medium">Edit mode</span>
          <span className="text-amber-600">— changes will update salary records and snapshots. Payslips will reflect the new values after saving.</span>
        </div>
      )}

      {/* Summary Cards */}
      <PreviewSummaryCards {...summary} />

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/50" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40"
          />
        </div>
        {!editMode && (
          <label className="flex items-center gap-2 text-[0.78rem] text-on-surface-variant cursor-pointer">
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
      <div className="rounded-lg bg-surface-card border border-outline-variant/15 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="text-left text-[0.72rem] uppercase tracking-wider text-on-surface-variant bg-surface-container-low">
                {!editMode && <th className="py-3 px-3 font-medium w-10" />}
                <th className="py-3 px-4 font-medium">Dispatcher</th>
                <th className="py-3 px-3 font-medium text-right">Orders</th>
                <th className="py-3 px-3 font-medium text-right">Base Salary</th>
                <th className="py-3 px-3 font-medium text-right">Incentive</th>
                <th className="py-3 px-3 font-medium text-right">Petrol</th>
                <th className="py-3 px-3 font-medium text-right">Penalty</th>
                <th className="py-3 px-3 font-medium text-right">Advance</th>
                <th className="py-3 px-4 font-medium text-right">Net Salary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.dispatcherId}
                  className="border-t border-outline-variant/8 hover:bg-surface-container-high/50 transition-colors"
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
                      <td className={`py-2.5 px-3 text-right tabular-nums ${r.incentive > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                        {formatRM(r.incentive)}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums ${r.petrolSubsidy > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
                        {formatRM(r.petrolSubsidy)}
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={editMode ? 8 : 9} className="py-12 text-center text-[0.85rem] text-on-surface-variant/60">
                    No dispatchers found.
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
