"use client";

import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Check, ChevronLeft, ChevronRight, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { DispatcherRow } from "./dispatcher-row";
import { AddDispatcherDrawer } from "./add-dispatcher-drawer";
import { DefaultsDrawer } from "./defaults-drawer";
import { DispatcherDrawer } from "./dispatcher-drawer";
import type { StaffDispatcher, AgentDefaults } from "@/lib/db/staff";

const PAGE_SIZE = 20;

interface StaffClientProps {
  dispatchers: StaffDispatcher[];
  branchCodes: string[];
  defaults: AgentDefaults;
}

function sortItems(list: StaffDispatcher[]) {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

import { ROW_GRID } from "./dispatcher-row";

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

export function StaffClient({ dispatchers: serverData, branchCodes, defaults }: StaffClientProps) {
  const router = useRouter();

  const [items, setItems] = useState(serverData);
  const [dataVersion, setDataVersion] = useState(0);
  const refreshResolveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    setItems(serverData);
    setDataVersion((v) => v + 1);
    if (refreshResolveRef.current) {
      refreshResolveRef.current();
      refreshResolveRef.current = null;
    }
  }, [serverData]);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<StaffDispatcher | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [drawerDispatcher, setDrawerDispatcher] = useState<StaffDispatcher | null>(null);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [saveButtonState, setSaveButtonState] = useState<"idle" | "saving" | "saved">("idle");
  const pendingSavesRef = useRef(0);
  const saveResolveRef = useRef<(() => void) | null>(null);

  // Branch dropdown
  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);
  const closeBranch = useCallback(() => setBranchOpen(false), []);
  useClickOutside(branchRef, closeBranch);

  // FLIP animation refs
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPositions = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    rowRefs.current.forEach((el, id) => {
      const prev = prevPositions.current.get(id);
      if (prev === undefined) return;
      const curr = el.getBoundingClientRect().top;
      const delta = prev - curr;
      if (Math.abs(delta) < 2) return;
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = "none";
      el.getBoundingClientRect();
      el.style.transform = "";
      el.style.transition = "transform 350ms cubic-bezier(0.2, 0, 0, 1)";
    });
    prevPositions.current.clear();
  });

  function capturePositions() {
    rowRefs.current.forEach((el, id) => {
      prevPositions.current.set(id, el.getBoundingClientRect().top);
    });
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((d) => {
        if (selectedBranch && d.branchCode !== selectedBranch) return false;
        if (q && !d.name.toLowerCase().includes(q) && !d.extId.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // Pinned first, then new (empty IC) first, then alphabetical
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        const aNew = a.rawIcNo === "";
        const bNew = b.rawIcNo === "";
        if (aNew !== bNew) return aNew ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [items, selectedBranch, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* ── Actions ─────────────────────────────────────────────── */

  async function handlePin(e: React.MouseEvent, dispatcher: StaffDispatcher) {
    e.stopPropagation();
    capturePositions();

    const wasPinned = dispatcher.isPinned;
    setItems((prev) => sortItems(prev.map((d) =>
      d.id === dispatcher.id ? { ...d, isPinned: !d.isPinned } : d,
    )));
    toast.success(wasPinned ? `${dispatcher.name} unpinned` : `${dispatcher.name} pinned`, { duration: 4000 });

    try {
      const res = await fetch(`/api/staff/${dispatcher.id}/pin`, { method: "PATCH" });
      if (!res.ok) throw new Error();
    } catch {
      // Revert optimistic update on failure
      capturePositions();
      setItems(serverData);
      toast.error("Failed to update pin status");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/staff/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete dispatcher");
    } finally {
      setDeleting(false);
    }
  }

  function handleBranchSelect(code: string) {
    setSelectedBranch(code === selectedBranch ? "" : code);
    setBranchOpen(false);
    setPage(1);
  }

  function handleFieldSaved(dispatcherId: string, isComplete: boolean) {
    setItems((prev) => prev.map((d) =>
      d.id === dispatcherId ? { ...d, isComplete } : d,
    ));
    // Track save completions for handleSaveAll
    if (pendingSavesRef.current > 0) {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current <= 0 && saveResolveRef.current) {
        saveResolveRef.current();
        saveResolveRef.current = null;
      }
    }
  }

  function handleDispatcherAdded(dispatcher: StaffDispatcher) {
    setItems((prev) => [{ ...dispatcher, isPinned: true }, ...prev.map((d) => d)]);
    setNewlyAddedIds((prev) => new Set(prev).add(dispatcher.id));
    setShowAddDrawer(false);
    setPage(1);
    fetch(`/api/staff/${dispatcher.id}/pin`, { method: "PATCH" }).then(() => router.refresh());
    toast.success(`${dispatcher.name} added`, {
      action: { label: "Go to Payroll", onClick: () => router.push("/payroll") },
    });
  }

  async function confirmBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(checkedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/staff/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch { /* continue */ }
    }
    setItems((prev) => prev.filter((d) => !checkedIds.has(d.id)));
    setCheckedIds(new Set());
    setShowBulkDelete(false);
    setBulkDeleting(false);
    toast.success(`${deleted} dispatcher${deleted !== 1 ? "s" : ""} deleted`);
  }

  function handleCheck(dispatcherId: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(dispatcherId);
      else next.delete(dispatcherId);
      return next;
    });
  }

  function handleErrorChange(dispatcherId: string, hasError: boolean) {
    setErrorIds((prev) => {
      const next = new Set(prev);
      if (hasError) next.add(dispatcherId);
      else next.delete(dispatcherId);
      return next;
    });
  }

  const handleDirtyChange = useCallback((dispatcherId: string, isDirty: boolean) => {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (isDirty) next.add(dispatcherId);
      else next.delete(dispatcherId);
      return next;
    });
  }, []);

  function handleAcknowledge(dispatcherId: string) {
    setNewlyAddedIds((prev) => {
      const next = new Set(prev);
      next.delete(dispatcherId);
      return next;
    });
    const item = items.find((d) => d.id === dispatcherId);
    if (item?.isPinned) {
      capturePositions();
      setItems((prev) => sortItems(prev.map((d) =>
        d.id === dispatcherId ? { ...d, isPinned: false } : d,
      )));
      fetch(`/api/staff/${dispatcherId}/pin`, { method: "PATCH" })
        .then(() => router.refresh())
        .catch(() => {});
    }
  }

  function handleAvatarChange(dispatcherId: string, avatarUrl: string | null) {
    setItems((prev) => prev.map((d) =>
      d.id === dispatcherId ? { ...d, avatarUrl } : d,
    ));
  }

  function handleSaveAll() {
    if (errorIds.size > 0 || newlyAddedIds.size > 0) {
      const msgs: string[] = [];
      if (errorIds.size > 0) msgs.push(`${errorIds.size} validation error${errorIds.size !== 1 ? "s" : ""}`);
      if (newlyAddedIds.size > 0) msgs.push(`${newlyAddedIds.size} unacknowledged dispatcher${newlyAddedIds.size !== 1 ? "s" : ""}`);
      toast.error(`Fix before saving: ${msgs.join(", ")}`);
      return;
    }
    if (dirtyIds.size === 0) {
      toast.success("No changes to save", { duration: 3000 });
      return;
    }
    setSaveButtonState("saving");
    pendingSavesRef.current = dirtyIds.size;
    // Wait for all saves to complete via onFieldSaved callbacks
    const allSaved = new Promise<void>((resolve) => {
      saveResolveRef.current = resolve;
    });
    setSaveTrigger((t) => t + 1);
    // Timeout fallback in case a save never calls onFieldSaved
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10000));
    Promise.race([allSaved, timeout]).then(() => {
      router.refresh();
      setSaveButtonState("saved");
      toast.success("All changes saved", { duration: 3000 });
      setTimeout(() => setSaveButtonState("idle"), 3000);
    });
  }

  const branchLabel = selectedBranch || "All Branches";
  const hasIssues = errorIds.size > 0 || newlyAddedIds.size > 0;
  const issueCount = errorIds.size + newlyAddedIds.size;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 px-8 pt-5 pb-4 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-6">
          <div className="shrink-0">
            <h1 className="font-heading font-bold text-[1.36rem] text-on-surface tracking-tight">Staff</h1>
            <p className="text-[0.72rem] text-on-surface-variant mt-0.5">
              Manage dispatchers and salary rules across all branches.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDefaults(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-on-surface bg-white border border-outline-variant/30 rounded-[0.375rem] hover:bg-surface-hover transition-colors"
            >
              Defaults
            </button>
            <button
              onClick={() => setShowAddDrawer(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors"
            >
              Add Dispatcher
            </button>
            {hasIssues ? (
              <button
                onClick={() => {
                  const msgs: string[] = [];
                  if (errorIds.size > 0) msgs.push(`${errorIds.size} validation error${errorIds.size !== 1 ? "s" : ""}`);
                  if (newlyAddedIds.size > 0) msgs.push(`${newlyAddedIds.size} unacknowledged dispatcher${newlyAddedIds.size !== 1 ? "s" : ""}`);
                  toast.error(`Fix before saving: ${msgs.join(", ")}`);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white bg-critical rounded-[0.375rem] cursor-not-allowed transition-colors"
              >
                <Save size={14} />
                {issueCount} Issue{issueCount !== 1 ? "s" : ""}
              </button>
            ) : saveButtonState === "saving" ? (
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white bg-green-600 rounded-[0.375rem] opacity-60 transition-colors"
              >
                <div className="w-3.5 h-3.5 border-[1.5px] border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </button>
            ) : saveButtonState === "saved" ? (
              <button
                disabled
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white bg-green-600 rounded-[0.375rem] transition-colors"
              >
                <Check size={14} />
                Saved
              </button>
            ) : (
              <button
                onClick={handleSaveAll}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-[0.84rem] font-medium text-white rounded-[0.375rem] transition-colors ${
                  dirtyIds.size > 0
                    ? "bg-brand hover:bg-brand/90"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                <Save size={14} />
                {dirtyIds.size > 0 ? `Save (${dirtyIds.size})` : "Save"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-8 pb-16 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div ref={branchRef} className="relative">
            <button
              onClick={() => setBranchOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-[0.375rem] text-[0.83rem] font-medium text-on-surface border border-outline-variant/30 hover:border-outline-variant/60 transition-colors min-w-28 justify-between"
            >
              <span className="truncate">{branchLabel}</span>
              <ChevronDown size={12} className={`text-on-surface-variant shrink-0 transition-transform ${branchOpen ? "rotate-180" : ""}`} />
            </button>
            {branchOpen && (
              <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-44 py-1 overflow-hidden">
                <button
                  onClick={() => handleBranchSelect("")}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${!selectedBranch ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                >
                  All Branches
                  {!selectedBranch && <Check size={13} className="text-brand" />}
                </button>
                {branchCodes.map((code) => (
                  <button
                    key={code}
                    onClick={() => handleBranchSelect(code)}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.77rem] transition-colors ${selectedBranch === code ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                  >
                    {code}
                    {selectedBranch === code && <Check size={13} className="text-brand" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-3 py-1.5 text-[0.83rem] bg-white rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-brand/40 w-52 border border-outline-variant/30 hover:border-outline-variant/60 transition-shadow"
            />
          </div>

          {checkedIds.size > 0 && (
            <button
              onClick={() => setShowBulkDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.78rem] font-medium text-critical bg-critical/10 rounded-[0.375rem] hover:bg-critical/15 transition-colors whitespace-nowrap"
            >
              <Trash2 size={13} />
              Delete {checkedIds.size} Selected
            </button>
          )}

          <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase whitespace-nowrap ml-auto">
            Showing {filtered.length} of {items.length} dispatchers
          </span>
        </div>

        {/* Table */}
        {paged.length === 0 ? (
          <div className="bg-white rounded-[0.75rem] p-12 text-center shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
            <p className="text-[0.9rem] text-on-surface-variant">No dispatchers match your search.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[0.75rem] flex flex-col shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] overflow-hidden">
            {/* Grouped column headers */}
            {/* Row 1: group labels */}
            <div className={`${ROW_GRID} px-5 pt-2.5 pb-0`}>
              <span /><span /><span /><span /><span />
              <span />
              <span className="col-span-3 text-center text-[0.8rem] font-semibold tracking-[0.06em] uppercase border-b-2 pb-1" style={{ color: "#12B981", borderColor: "rgba(18, 185, 129, 0.3)" }}>Incentive</span>
              <span />
              <span className="col-span-3 text-center text-[0.8rem] font-semibold tracking-[0.06em] uppercase border-b-2 pb-1" style={{ color: "#D4A017", borderColor: "rgba(251, 192, 36, 0.35)" }}>Petrol</span>
              <span /><span />
            </div>
            {/* Row 2: sub-column labels */}
            <div className={`${ROW_GRID} px-5 pt-1 pb-2 border-b border-outline-variant/15`}>
              {/* Select all checkbox */}
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={checkedIds.size > 0 && paged.every((d) => checkedIds.has(d.id))}
                  ref={(el) => { if (el) el.indeterminate = checkedIds.size > 0 && !paged.every((d) => checkedIds.has(d.id)); }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setCheckedIds(new Set(paged.map((d) => d.id)));
                    } else {
                      setCheckedIds(new Set());
                    }
                  }}
                  className="w-3.5 h-3.5 rounded-sm border-outline-variant/40 text-brand focus:ring-brand/30 cursor-pointer accent-brand"
                />
              </div>
              {[
                "Dispatcher", "Branch", "IC No", "Tiers",
                "",
                "Eligible", "Min Orders", "Amount (RM)",
                "",
                "Eligible", "Min Orders", "Amount (RM)",
                "Status", "",
              ].map((h, i) => (
                <span key={`${h}-${i}`} className={`text-[0.62rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase text-center ${i === 0 ? "text-left!" : ""}`}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {paged.map((d) => (
              <div
                key={d.id}
                ref={(el) => { if (el) rowRefs.current.set(d.id, el); else rowRefs.current.delete(d.id); }}
              >
                <DispatcherRow
                  dispatcher={d}
                  dataVersion={dataVersion}
                  defaults={defaults}
                  branchCodes={branchCodes}
                  saveTrigger={saveTrigger}
                  isNew={newlyAddedIds.has(d.id)}
                  isChecked={checkedIds.has(d.id)}
                  onCheck={handleCheck}
                  onPin={handlePin}
                  onDelete={setDeleteTarget}
                  onFieldSaved={handleFieldSaved}
                  onAvatarChange={handleAvatarChange}
                  onAcknowledge={handleAcknowledge}
                  onErrorChange={handleErrorChange}
                  onOpenDrawer={setDrawerDispatcher}
                  onDirtyChange={handleDirtyChange}
                />
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
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
                      safePage === p
                        ? "bg-brand text-white"
                        : "text-on-surface-variant hover:bg-surface-hover"
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
      </main>

      {/* Dispatcher Drawer (History) */}
      {drawerDispatcher && (
        <DispatcherDrawer
          dispatcher={drawerDispatcher}
          onClose={() => setDrawerDispatcher(null)}
        />
      )}

      {/* Defaults Drawer */}
      {showDefaults && (
        <DefaultsDrawer
          checkedIds={checkedIds}
          initialValues={defaults}
          onClose={() => setShowDefaults(false)}
          onApplied={() => {
            setCheckedIds(new Set());
            router.refresh();
            return new Promise<void>((resolve) => { refreshResolveRef.current = resolve; });
          }}
        />
      )}

      {/* Add Dispatcher Drawer */}
      {showAddDrawer && (
        <AddDispatcherDrawer
          branchCodes={branchCodes}
          onClose={() => setShowAddDrawer(false)}
          onAdded={handleDispatcherAdded}
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
              This will permanently delete this dispatcher and all their salary rules. This cannot be undone.
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
      {/* Bulk Delete Dialog */}
      {showBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setShowBulkDelete(false)} />
          <div className="relative bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] max-w-sm w-full mx-4">
            <h3 className="font-heading font-semibold text-[1.1rem] text-on-surface">
              Delete {checkedIds.size} dispatcher{checkedIds.size !== 1 ? "s" : ""}?
            </h3>
            <p className="text-[0.84rem] text-on-surface-variant mt-2">
              This will permanently delete the selected dispatchers and all their salary rules. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setShowBulkDelete(false)} className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors">
                Cancel
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={bulkDeleting}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-critical rounded-[0.375rem] hover:bg-critical/90 transition-colors disabled:opacity-60"
              >
                {bulkDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
