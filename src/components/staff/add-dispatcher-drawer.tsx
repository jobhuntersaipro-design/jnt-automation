"use client";

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import type { StaffDispatcher } from "@/lib/db/staff";

interface AddDispatcherDrawerProps {
  branchCodes: string[];
  onClose: () => void;
  onAdded: (dispatcher: StaffDispatcher) => void;
  onBranchAdded?: (code: string) => void;
}

export function AddDispatcherDrawer({ branchCodes: initialBranchCodes, onClose, onAdded, onBranchAdded }: AddDispatcherDrawerProps) {
  const [name, setName] = useState("");
  const [extId, setExtId] = useState("");
  const [icNo, setIcNo] = useState("");
  const [localBranches, setLocalBranches] = useState(initialBranchCodes);
  const [branchCode, setBranchCode] = useState(initialBranchCodes[0] ?? "");
  const [branchOpen, setBranchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Add branch inline state
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddBranch) newBranchInputRef.current?.focus();
  }, [showAddBranch]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!extId.trim()) errs.extId = "Dispatcher ID is required";
    if (icNo.trim() && !/^\d{12}$/.test(icNo)) errs.icNo = "Must be 12 digits";
    if (!branchCode) errs.branchCode = "Branch is required";
    return errs;
  }

  async function handleAddBranch() {
    if (!newBranchCode.trim()) return;
    setAddingBranch(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newBranchCode.trim() }),
      });

      if (res.status === 409) {
        toast.error("Branch already exists");
        return;
      }

      if (res.status === 403) {
        const data = await res.json();
        toast.error(data.error || "Branch limit reached");
        return;
      }

      if (!res.ok) {
        toast.error("Failed to add branch");
        return;
      }

      const { branch } = await res.json();
      setLocalBranches((prev) => [...prev, branch.code]);
      setBranchCode(branch.code);
      setShowAddBranch(false);
      setNewBranchCode("");
      setBranchOpen(false);
      setErrors((p) => ({ ...p, branchCode: "" }));
      onBranchAdded?.(branch.code);
      toast.success(`Branch ${branch.code} added`);
    } catch {
      toast.error("Failed to add branch");
    } finally {
      setAddingBranch(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), extId: extId.trim(), icNo, branchCode }),
      });

      if (res.status === 409) {
        setErrors({ extId: "A dispatcher with this ID already exists in the selected branch" });
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to add dispatcher");
        return;
      }

      const { dispatcher } = await res.json();
      onAdded(dispatcher);
      toast.success("Dispatcher added. Complete their salary rules.", { duration: 5000 });
    } catch {
      toast.error("Failed to add dispatcher");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-on-surface/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">Add Dispatcher</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-hover transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form id="add-dispatcher-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="Enter dispatcher name"
              className={`w-full px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors ${errors.name ? "border-critical/50" : "border-outline-variant/30"}`}
            />
            {errors.name && <p className="text-[0.68rem] text-critical mt-1">{errors.name}</p>}
          </div>

          {/* Dispatcher ID */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Dispatcher ID
            </label>
            <input
              type="text"
              value={extId}
              onChange={(e) => { setExtId(e.target.value); setErrors((p) => ({ ...p, extId: "" })); }}
              placeholder="Enter dispatcher ID"
              className={`w-full px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors ${errors.extId ? "border-critical/50" : "border-outline-variant/30"}`}
            />
            {errors.extId && <p className="text-[0.68rem] text-critical mt-1">{errors.extId}</p>}
          </div>

          {/* IC Number */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              IC Number
            </label>
            <input
              type="text"
              value={icNo ? icNo.replace(/(\d{4})(?=\d)/g, "$1-") : ""}
              onChange={(e) => { setIcNo(e.target.value.replace(/\D/g, "").slice(0, 12)); setErrors((p) => ({ ...p, icNo: "" })); }}
              placeholder="12-digit IC number"
              maxLength={14}
              className={`w-full px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors tabular-nums ${errors.icNo ? "border-critical/50" : "border-outline-variant/30"}`}
            />
            {errors.icNo && <p className="text-[0.68rem] text-critical mt-1">{errors.icNo}</p>}
          </div>

          {/* Branch */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Branch
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setBranchOpen((o) => !o)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface transition-colors ${errors.branchCode ? "border-critical/50" : "border-outline-variant/30"}`}
              >
                <span className={branchCode ? "text-on-surface" : "text-on-surface-variant/50"}>
                  {branchCode || "Select branch"}
                </span>
                <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${branchOpen ? "rotate-180" : ""}`} />
              </button>
              {branchOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-full py-1">
                  {localBranches.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => { setBranchCode(code); setBranchOpen(false); setErrors((p) => ({ ...p, branchCode: "" })); }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.84rem] transition-colors ${branchCode === code ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                    >
                      {code}
                      {branchCode === code && <Check size={13} className="text-brand" />}
                    </button>
                  ))}

                  {/* Add Branch row */}
                  <div className="border-t border-outline-variant/15 mt-1 pt-1">
                    {showAddBranch ? (
                      <div className="px-3 py-1.5 flex items-center gap-2">
                        <input
                          ref={newBranchInputRef}
                          type="text"
                          value={newBranchCode}
                          onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); handleAddBranch(); }
                            if (e.key === "Escape") { setShowAddBranch(false); setNewBranchCode(""); }
                          }}
                          placeholder="e.g. PHG1234"
                          className="flex-1 px-2 py-1 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40"
                        />
                        <button
                          type="button"
                          onClick={handleAddBranch}
                          disabled={addingBranch || !newBranchCode.trim()}
                          className="px-2 py-1 text-[0.72rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 disabled:opacity-50 transition-colors"
                        >
                          {addingBranch ? "..." : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowAddBranch(false); setNewBranchCode(""); }}
                          className="p-1 text-on-surface-variant hover:text-on-surface transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddBranch(true)}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-[0.84rem] text-brand hover:bg-surface-low transition-colors"
                      >
                        <Plus size={14} />
                        Add Branch
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {errors.branchCode && <p className="text-[0.68rem] text-critical mt-1">{errors.branchCode}</p>}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/15 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-dispatcher-form"
            disabled={submitting}
            className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add Dispatcher"}
          </button>
        </div>
      </div>
    </div>
  );
}
