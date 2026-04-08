"use client";

import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Pin, Trash2, Search, ChevronDown, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import type { StaffDispatcher } from "@/lib/db/staff";

const PAGE_SIZE = 20;

interface StaffClientProps {
  dispatchers: StaffDispatcher[];
  branchCodes: string[];
}

/* ─── Helpers ──────────────────────────────────────────────── */

function Avatar({ name, gender }: { name: string; gender: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const ringColor =
    gender === "MALE"
      ? "var(--color-brand)"
      : gender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-low text-[0.8rem] font-semibold text-on-surface-variant shrink-0"
      style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
    >
      {initials}
    </div>
  );
}

function sortItems(list: StaffDispatcher[]) {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/* ─── Main Component ───────────────────────────────────────── */

export function StaffClient({ dispatchers: serverData, branchCodes }: StaffClientProps) {
  const router = useRouter();

  // Master list — updated optimistically on pin/delete, resynced on server refresh
  const [items, setItems] = useState(serverData);
  useEffect(() => { setItems(serverData); }, [serverData]);

  // Filter state
  const [selectedBranch, setSelectedBranch] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Drawer state
  const [drawerDispatcher, setDrawerDispatcher] = useState<StaffDispatcher | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<StaffDispatcher | null>(null);

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
      el.getBoundingClientRect(); // force reflow
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

  // Client-side filtering — instant
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((d) => {
      if (selectedBranch && d.branchCode !== selectedBranch) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.extId.toLowerCase().includes(q)) return false;
      return true;
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
      router.refresh();
    } catch {
      capturePositions();
      setItems(serverData);
      toast.error("Failed to update pin status");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/staff/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deleted`);
      router.refresh();
    } catch {
      toast.error("Failed to delete dispatcher");
    } finally {
      setDeleteTarget(null);
    }
  }

  function handleBranchSelect(code: string) {
    setSelectedBranch(code === selectedBranch ? "" : code);
    setBranchOpen(false);
    setPage(1);
  }

  /* ── Drawer ──────────────────────────────────────────────── */

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeDrawer = useCallback(() => setDrawerDispatcher(null), []);
  useClickOutside(drawerRef, closeDrawer);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") closeDrawer(); }
    if (drawerDispatcher) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [drawerDispatcher, closeDrawer]);

  /* ── Render ──────────────────────────────────────────────── */

  const branchLabel = selectedBranch || "All Branches";

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
          <button
            disabled
            className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] opacity-60 cursor-not-allowed"
          >
            Add Dispatcher
          </button>
        </div>
      </header>

      <main className="px-8 pb-16 space-y-4">
        {/* ── Filters ─────────────────────────────────────── */}
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

          <span className="text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase whitespace-nowrap ml-auto">
            Showing {filtered.length} of {items.length} dispatchers
          </span>
        </div>

        {/* ── Table ───────────────────────────────────────── */}
        {paged.length === 0 ? (
          <div className="bg-white rounded-[0.75rem] p-12 text-center shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
            <p className="text-[0.9rem] text-on-surface-variant">No dispatchers match your search.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[0.75rem] flex flex-col shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)]">
            {/* Column headers */}
            <div className="grid grid-cols-[2.5fr_1fr_1.2fr_1fr_0.8fr] px-6 py-3">
              {["Dispatcher", "Branch", "IC No", "Status", "Actions"].map((h, i) => (
                <span key={h} className={`text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase ${i === 4 ? "text-right" : ""}`}>
                  {h}
                </span>
              ))}
            </div>

            {paged.map((d) => (
              <div
                key={d.id}
                ref={(el) => { if (el) rowRefs.current.set(d.id, el); else rowRefs.current.delete(d.id); }}
                onClick={() => setDrawerDispatcher(d)}
                className={`grid grid-cols-[2.5fr_1fr_1.2fr_1fr_0.8fr] items-center px-6 py-[0.9rem] cursor-pointer transition-colors ${
                  d.isPinned ? "bg-brand/6 hover:bg-brand/10" : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={d.name} gender={d.gender} />
                  <div className="min-w-0">
                    <p className="text-[0.9rem] font-medium text-on-surface truncate">{d.name}</p>
                    <p className="text-[0.72rem] text-on-surface-variant">{d.extId}</p>
                  </div>
                </div>

                <span className="inline-block px-2 py-0.5 text-[0.8rem] font-medium text-on-surface-variant bg-surface-low rounded-[0.375rem] w-fit">
                  {d.branchCode}
                </span>

                <span className="text-[0.84rem] tabular-nums text-on-surface-variant font-mono">{d.icNo}</span>

                <span className={`inline-flex items-center gap-1 text-[0.8rem] font-medium ${d.isComplete ? "text-green-600" : "text-amber-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${d.isComplete ? "bg-green-500" : "bg-amber-400"}`} />
                  {d.isComplete ? "Complete" : "Incomplete"}
                </span>

                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={(e) => handlePin(e, d)}
                    className={`p-1.5 rounded-[0.375rem] transition-all ${
                      d.isPinned
                        ? "text-brand hover:bg-brand/10 hover:scale-110"
                        : "text-on-surface-variant hover:text-brand hover:bg-brand/10 hover:scale-110"
                    }`}
                    title={d.isPinned ? "Unpin" : "Pin to top"}
                  >
                    <Pin size={15} fill={d.isPinned ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(d); }}
                    className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:text-critical hover:bg-critical/5 transition-colors"
                    title="Delete dispatcher"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────── */}
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
              <span className="text-[0.72rem] font-medium text-on-surface-variant tabular-nums px-1">
                {safePage} / {totalPages}
              </span>
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

      {/* ── Delete Dialog ───────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-on-surface/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-[0.75rem] p-6 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] max-w-sm w-full mx-4">
            <h3 className="font-heading font-semibold text-[1.1rem] text-on-surface">
              Delete {deleteTarget.name}?
            </h3>
            <p className="text-[0.84rem] text-on-surface-variant mt-2">
              This will permanently delete this dispatcher and all their salary rules. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 text-[0.84rem] font-medium text-white bg-critical rounded-[0.375rem] hover:bg-critical/90 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer ──────────────────────────────────────────── */}
      {drawerDispatcher && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-on-surface/30" />
          <div
            ref={drawerRef}
            className="absolute right-0 top-0 bottom-0 w-120 max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right"
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/20">
              <Avatar name={drawerDispatcher.name} gender={drawerDispatcher.gender} />
              <div className="flex-1 min-w-0">
                <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface truncate">{drawerDispatcher.name}</h2>
                <p className="text-[0.75rem] text-on-surface-variant">{drawerDispatcher.extId}</p>
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 px-6 py-8 overflow-y-auto">
              <p className="text-[0.9rem] text-on-surface-variant">Dispatcher settings coming soon.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
