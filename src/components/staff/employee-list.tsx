"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Check, ChevronLeft, ChevronRight, Pencil, Trash2, UserPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { StaffEmployee } from "@/lib/db/employees";
import { BranchChip } from "@/components/ui/branch-chip";

const EmployeeDrawer = dynamic(
  () => import("./employee-drawer").then((m) => m.EmployeeDrawer),
  { ssr: false },
);

type EmployeeType = "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<EmployeeType, string> = {
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
  STORE_KEEPER: "Store Keeper",
};

const TYPE_CHIP_CLASS: Record<EmployeeType, string> = {
  SUPERVISOR: "bg-blue-50 text-blue-700",
  ADMIN: "bg-purple-50 text-purple-700",
  STORE_KEEPER: "bg-amber-50 text-amber-700",
};

function getPageNumbers(current: number, total: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("...");
  }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total) {
    if (end < total - 1) pages.push("...");
    pages.push(total);
  }
  return pages;
}

interface EmployeeListProps {
  employees: StaffEmployee[];
  branchCodes: string[];
  onBranchAdded?: (code: string) => void;
}

export function EmployeeList({ employees: serverData, branchCodes, onBranchAdded }: EmployeeListProps) {
  const router = useRouter();

  const [items, setItems] = useState(serverData);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<EmployeeType | "">("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<StaffEmployee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [drawerEmployee, setDrawerEmployee] = useState<StaffEmployee | null | undefined>(undefined);
  // undefined = closed, null = new, StaffEmployee = edit

  // Sync server data on refresh
  useEffect(() => { setItems(serverData); }, [serverData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((e) => {
        if (filterType && e.type !== filterType) return false;
        if (q && !e.name.toLowerCase().includes(q) && !e.rawIcNo.includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filterType, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/employees/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete employee");
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved(emp: StaffEmployee) {
    setItems((prev) => {
      const idx = prev.findIndex((e) => e.id === emp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = emp;
        return next;
      }
      return [emp, ...prev];
    });
    setDrawerEmployee(undefined);
    router.refresh();
  }

  const typeLabel = filterType ? TYPE_LABEL[filterType] : "All Types";

  return (
    <>
      {/* Header buttons */}
      <div className="flex items-center gap-2 mb-0">
        <button
          onClick={() => setDrawerEmployee(null)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors"
        >
          <UserPlus size={14} />
          Add Employee
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mt-4">
        <div className="relative">
          <button
            onClick={() => setTypeOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-outline-variant/30 hover:border-outline-variant/60 transition-colors min-w-28 justify-between"
          >
            <span className="truncate">{typeLabel}</span>
            <ChevronDown size={12} className={`text-on-surface-variant shrink-0 transition-transform ${typeOpen ? "rotate-180" : ""}`} />
          </button>
          {typeOpen && (
            <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-44 py-1">
              <button
                onClick={() => { setFilterType(""); setTypeOpen(false); setPage(1); }}
                className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${!filterType ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
              >
                All Types
                {!filterType && <Check size={13} className="text-brand" />}
              </button>
              {(["SUPERVISOR", "ADMIN", "STORE_KEEPER"] as EmployeeType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setFilterType(t); setTypeOpen(false); setPage(1); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${filterType === t ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                >
                  {TYPE_LABEL[t]}
                  {filterType === t && <Check size={13} className="text-brand" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder="Search name or IC..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 pr-3 py-1.5 text-[0.83rem] bg-white rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-brand/40 w-52 border border-outline-variant/30 hover:border-outline-variant/60 transition-shadow"
          />
        </div>

        <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase whitespace-nowrap ml-auto">
          Showing {filtered.length} of {items.length} employees
        </span>
      </div>

      {/* Table */}
      {paged.length === 0 ? (
        <div className="bg-white rounded-[0.75rem] p-12 text-center shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] mt-4">
          <p className="text-[0.9rem] text-on-surface-variant">
            {items.length === 0 ? "No employees yet. Add your first employee to get started." : "No employees match your search."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-[0.75rem] flex flex-col shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] overflow-x-auto mt-4">
          {/* Column headers */}
          <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr_0.5fr_3rem] px-5 pt-3 pb-2 border-b border-outline-variant/15">
            {["Employee", "Type", "Branch", "IC No", "Pay", "Dispatcher", "Status", ""].map((h, i) => (
              <span key={`${h}-${i}`} className={`text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase ${i === 0 ? "text-left" : "text-center"}`}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {paged.map((emp) => (
            <div
              key={emp.id}
              onClick={() => setDrawerEmployee(emp)}
              className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr_0.5fr_3rem] px-5 py-3 items-center border-b border-outline-variant/8 last:border-b-0 hover:bg-surface-hover cursor-pointer transition-colors"
            >
              {/* Employee name + initials avatar */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-dim flex items-center justify-center text-[0.68rem] font-semibold text-on-surface-variant shrink-0">
                  {emp.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-[0.84rem] font-medium text-on-surface leading-tight">{emp.name}</p>
                </div>
              </div>

              {/* Type chip */}
              <div className="flex justify-center">
                <span className={`px-2 py-0.5 rounded-lg text-[0.68rem] font-medium ${TYPE_CHIP_CLASS[emp.type]}`}>
                  {TYPE_LABEL[emp.type]}
                </span>
              </div>

              {/* Branch */}
              <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                {emp.branchCode ? (
                  <BranchChip code={emp.branchCode} />
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[0.68rem] font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                    title="Branch is required — click the row to set it"
                  >
                    <AlertTriangle size={10} />
                    Set branch
                  </span>
                )}
              </div>

              {/* IC */}
              <p className="text-[0.84rem] text-on-surface-variant text-center font-mono">
                {emp.icNo || <span className="text-on-surface-variant/40">Not set</span>}
              </p>

              {/* Pay */}
              <p className="text-[0.84rem] text-on-surface text-center tabular-nums font-medium">
                {emp.type === "STORE_KEEPER"
                  ? `RM${(emp.hourlyWage ?? 0).toFixed(2)}/hr`
                  : `RM${(emp.basicPay ?? 0).toFixed(2)}`
                }
              </p>

              {/* Dispatcher link */}
              <p className="text-[0.78rem] text-center">
                {emp.dispatcherExtId ? (
                  <span className="text-brand font-medium">{emp.dispatcherExtId}</span>
                ) : (
                  <span className="text-on-surface-variant/40">&mdash;</span>
                )}
              </p>

              {/* Status */}
              <div className="flex justify-center">
                {emp.isComplete ? (
                  <span className="px-2 py-0.5 rounded-lg text-[0.68rem] font-medium bg-green-50 text-green-700">Complete</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-lg text-[0.68rem] font-medium bg-amber-50 text-amber-700">Missing IC</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setDrawerEmployee(emp); }}
                  className="p-1 rounded text-on-surface-variant hover:text-brand hover:bg-surface-hover transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(emp); }}
                  className="p-1 rounded text-on-surface-variant hover:text-critical hover:bg-critical/5 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {getPageNumbers(safePage, totalPages).map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="text-[0.72rem] text-on-surface-variant px-1">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`w-7 h-7 flex items-center justify-center rounded-[0.375rem] text-[0.72rem] font-medium tabular-nums transition-colors ${
                    safePage === p ? "bg-brand text-white" : "text-on-surface-variant hover:bg-surface-hover"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Employee Drawer */}
      {drawerEmployee !== undefined && (
        <EmployeeDrawer
          employee={drawerEmployee}
          branchCodes={branchCodes}
          onClose={() => setDrawerEmployee(undefined)}
          onSaved={handleSaved}
          onAvatarChange={(employeeId, patch) => {
            setItems((prev) =>
              prev.map((e) => (e.id === employeeId ? { ...e, ...patch } : e)),
            );
            setDrawerEmployee((cur) =>
              cur && cur.id === employeeId ? { ...cur, ...patch } : cur,
            );
          }}
          onBranchAdded={onBranchAdded}
        />
      )}

      {/* Delete Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] max-w-sm w-full mx-4">
            <h3 className="font-heading font-semibold text-[1.1rem] text-on-surface">
              Delete {deleteTarget.name}?
            </h3>
            <p className="text-[0.84rem] text-on-surface-variant mt-2">
              This will permanently delete this employee. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors disabled:opacity-60">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="px-4 py-2 text-[0.84rem] font-medium text-white bg-critical rounded-[0.375rem] hover:bg-critical/90 transition-colors disabled:opacity-60">
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
