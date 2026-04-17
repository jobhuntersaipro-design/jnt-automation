"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Check, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import type { StaffEmployee } from "@/lib/db/employees";
import type { StaffDispatcher } from "@/lib/db/staff";

type EmployeeType = "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";

interface EmployeeDrawerProps {
  employee?: StaffEmployee | null;
  dispatchers: StaffDispatcher[];
  branchCodes: string[];
  onClose: () => void;
  onSaved: (employee: StaffEmployee) => void;
  onBranchAdded?: (code: string) => void;
}

const TYPE_OPTIONS: { value: EmployeeType; label: string }[] = [
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "ADMIN", label: "Admin" },
  { value: "STORE_KEEPER", label: "Store Keeper" },
];

const TYPE_LABEL: Record<EmployeeType, string> = {
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
  STORE_KEEPER: "Store Keeper",
};

export function EmployeeDrawer({ employee, dispatchers, branchCodes: initialBranchCodes, onClose, onSaved, onBranchAdded }: EmployeeDrawerProps) {
  const isEdit = !!employee;

  const [name, setName] = useState(employee?.name ?? "");
  const [extId, setExtId] = useState(employee?.extId ?? "");
  const [icNo, setIcNo] = useState(employee?.rawIcNo ?? "");
  const [type, setType] = useState<EmployeeType>(employee?.type ?? "SUPERVISOR");
  const [branchCode, setBranchCode] = useState(employee?.branchCode ?? "");
  const [localBranches, setLocalBranches] = useState(initialBranchCodes);

  const [dispatcherId, setDispatcherId] = useState<string | null>(employee?.dispatcherId ?? null);
  const [alsoDispatcher, setAlsoDispatcher] = useState(!!employee?.dispatcherId);
  const [dispatcherSearch, setDispatcherSearch] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  // Add branch inline
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState("");
  const [addingBranch, setAddingBranch] = useState(false);
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (showAddBranch) newBranchInputRef.current?.focus();
  }, [showAddBranch]);

  useEffect(() => {
    if (!alsoDispatcher) {
      setDispatcherId(null);
    }
  }, [alsoDispatcher]);

  function selectDispatcher(d: StaffDispatcher) {
    setDispatcherId(d.id);
    setErrors((p) => ({ ...p, dispatcher: "" }));
    // Always sync name, employee ID, and branch from dispatcher
    setName(d.name);
    setExtId(d.extId);
    if (d.branchCode) setBranchCode(d.branchCode);
  }

  const filteredDispatchers = dispatchers.filter((d) => {
    const q = dispatcherSearch.toLowerCase();
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || d.extId.toLowerCase().includes(q);
  });

  async function handleAddBranch() {
    if (!newBranchCode.trim()) return;
    setAddingBranch(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newBranchCode.trim() }),
      });
      if (res.status === 409) { toast.error("Branch already exists"); return; }
      if (res.status === 403) { const d = await res.json(); toast.error(d.error || "Branch limit reached"); return; }
      if (!res.ok) { toast.error("Failed to add branch"); return; }
      const { branch } = await res.json();
      setLocalBranches((prev) => [...prev, branch.code]);
      setBranchCode(branch.code);
      setShowAddBranch(false);
      setNewBranchCode("");
      setBranchOpen(false);
      onBranchAdded?.(branch.code);
      toast.success(`Branch ${branch.code} added`);
    } catch { toast.error("Failed to add branch"); }
    finally { setAddingBranch(false); }
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (icNo.trim() && !/^\d{12}$/.test(icNo)) errs.icNo = "Must be 12 digits";
    if (alsoDispatcher && !dispatcherId) errs.dispatcher = "Select a dispatcher to link";
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        extId: extId.trim() || null,
        icNo: icNo.trim() || null,
        type,
        branchCode: branchCode || null,
        dispatcherId: alsoDispatcher ? dispatcherId : null,
      };

      const url = isEdit ? `/api/employees/${employee.id}` : "/api/employees";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save employee");
        return;
      }

      if (isEdit) {
        const linkedDispatcher = dispatcherId ? dispatchers.find((d) => d.id === dispatcherId) : null;
        const updated: StaffEmployee = {
          ...employee,
          extId: extId.trim(),
          name: name.trim(),
          rawIcNo: icNo.trim(),
          icNo: icNo.trim() ? "\u2022".repeat(8) + icNo.trim().slice(-4) : "",
          type,
          branchCode: branchCode || null,
          dispatcherId: alsoDispatcher ? dispatcherId : null,
          dispatcherExtId: linkedDispatcher?.extId ?? null,
          dispatcherBranch: linkedDispatcher?.branchCode ?? null,
          isComplete: !!icNo.trim(),
          gender: employee.gender,
        };
        onSaved(updated);
        toast.success("Employee updated");
      } else {
        const { employee: newEmployee } = await res.json();
        onSaved(newEmployee);
        toast.success("Employee added");
      }
    } catch {
      toast.error("Failed to save employee");
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
          <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">
            {isEdit ? "Edit Employee" : "Add Employee"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-hover transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form id="employee-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Also a Dispatcher toggle — at top */}
          <div className="pb-3 border-b border-outline-variant/15">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.84rem] font-medium text-on-surface">Also a Dispatcher</p>
                <p className="text-[0.68rem] text-on-surface-variant mt-0.5">Link to an existing dispatcher — auto-fills name, ID & branch</p>
              </div>
              <button
                type="button"
                onClick={() => setAlsoDispatcher((v) => !v)}
                className={`relative w-10 h-5.5 rounded-full transition-colors ${alsoDispatcher ? "bg-brand" : "bg-outline-variant/40"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-transform ${alsoDispatcher ? "translate-x-4.5" : ""}`} />
              </button>
            </div>

            {alsoDispatcher && (
              <div className="mt-3">
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search dispatcher by name or ID..."
                    value={dispatcherSearch}
                    onChange={(e) => setDispatcherSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                </div>
                <div className={`border rounded-[0.375rem] max-h-40 overflow-y-auto ${errors.dispatcher ? "border-critical/50" : "border-outline-variant/30"}`}>
                  {filteredDispatchers.length === 0 ? (
                    <p className="px-3 py-2 text-[0.78rem] text-on-surface-variant/60">No dispatchers found</p>
                  ) : (
                    filteredDispatchers.map((d) => {
                      const isSelected = dispatcherId === d.id;
                      return (
                        <div
                          key={d.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectDispatcher(d)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDispatcher(d); } }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-b border-outline-variant/10 last:border-b-0 ${
                            isSelected ? "bg-primary/5" : "hover:bg-surface-container-low"
                          }`}
                        >
                          <div>
                            <p className={`text-[0.84rem] leading-tight ${isSelected ? "text-primary font-semibold" : "text-on-surface"}`}>{d.name}</p>
                            <p className="text-[0.68rem] text-on-surface-variant/60 mt-0.5">{d.extId} &middot; {d.branchCode}</p>
                          </div>
                          {isSelected && <Check size={13} className="text-primary shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
                {errors.dispatcher && <p className="text-[0.68rem] text-critical mt-1">{errors.dispatcher}</p>}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Full Name {dispatcherId && <span className="text-on-surface-variant/50 normal-case">(from dispatcher)</span>}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
              placeholder="Enter employee name"
              readOnly={!!dispatcherId}
              className={`w-full px-3 py-2 text-[0.84rem] border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors ${dispatcherId ? "bg-surface-dim/30 cursor-not-allowed" : "bg-white"} ${errors.name ? "border-critical/50" : "border-outline-variant/30"}`}
            />
            {errors.name && <p className="text-[0.68rem] text-critical mt-1">{errors.name}</p>}
          </div>

          {/* Employee ID */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Employee ID {dispatcherId ? <span className="text-on-surface-variant/50 normal-case">(from dispatcher)</span> : <span className="text-on-surface-variant/50 normal-case">(optional)</span>}
            </label>
            <input
              type="text"
              value={extId}
              onChange={(e) => setExtId(e.target.value)}
              placeholder="Enter employee ID"
              readOnly={!!dispatcherId}
              className={`w-full px-3 py-2 text-[0.84rem] border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors ${dispatcherId ? "bg-surface-dim/30 cursor-not-allowed" : "bg-white"}`}
            />
          </div>

          {/* Employee Type */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Position
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface transition-colors"
              >
                <span>{TYPE_LABEL[type]}</span>
                <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${typeOpen ? "rotate-180" : ""}`} />
              </button>
              {typeOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-full py-1">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setType(opt.value); setTypeOpen(false); }}
                      className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.84rem] transition-colors ${type === opt.value ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                    >
                      {opt.label}
                      {type === opt.value && <Check size={13} className="text-brand" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Branch */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              Branch {dispatcherId ? <span className="text-on-surface-variant/50 normal-case">(from dispatcher)</span> : <span className="text-on-surface-variant/50 normal-case">(optional)</span>}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { if (!dispatcherId) setBranchOpen((o) => !o); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-[0.84rem] border border-outline-variant/30 rounded-[0.375rem] text-on-surface transition-colors ${dispatcherId ? "bg-surface-dim/30 cursor-not-allowed" : "bg-white"}`}
              >
                <span className={branchCode ? "text-on-surface" : "text-on-surface-variant/50"}>
                  {branchCode || "Select branch"}
                </span>
                <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${branchOpen ? "rotate-180" : ""}`} />
              </button>
              {branchOpen && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-[0.5rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.14)] border border-outline-variant/20 z-50 w-full py-1">
                  <button
                    type="button"
                    onClick={() => { setBranchCode(""); setBranchOpen(false); }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.84rem] transition-colors ${!branchCode ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                  >
                    None
                    {!branchCode && <Check size={13} className="text-brand" />}
                  </button>
                  {localBranches.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => { setBranchCode(code); setBranchOpen(false); }}
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
                        <button type="button" onClick={() => { setShowAddBranch(false); setNewBranchCode(""); }} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
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
          </div>

          {/* IC Number */}
          <div>
            <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
              IC Number <span className="text-on-surface-variant/50 normal-case">(optional)</span>
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
            form="employee-form"
            disabled={submitting}
            className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-60"
          >
            {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}
