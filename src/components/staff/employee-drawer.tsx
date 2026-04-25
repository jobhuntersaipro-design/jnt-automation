"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Check, Plus, BarChart3, Settings, Link2 } from "lucide-react";
import { toast } from "sonner";
import { DispatcherAvatar } from "./dispatcher-avatar";
import { EmployeeHistoryTab } from "./employee-history-tab";
import type { StaffEmployee } from "@/lib/db/employees";

type EmployeeType = "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";

interface EmployeeDrawerProps {
  employee?: StaffEmployee | null;
  branchCodes: string[];
  onClose: () => void;
  /** Called after the Save Changes form submit — parent typically closes the drawer. */
  onSaved: (employee: StaffEmployee) => void;
  /** Called after avatar upload / pick / remove — parent should update the row without closing. */
  onAvatarChange?: (employeeId: string, patch: Pick<StaffEmployee, "avatarUrl" | "dispatcherAvatarUrl">) => void;
  onBranchAdded?: (code: string) => void;
  /** Pre-select a branch when opening the drawer for a new employee (ignored in edit mode). */
  initialBranchCode?: string;
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

type Gender = "MALE" | "FEMALE" | "UNKNOWN";

function deriveGenderClient(icNo: string): Gender {
  const lastDigit = parseInt(icNo.slice(-1));
  if (isNaN(lastDigit)) return "UNKNOWN";
  return lastDigit % 2 !== 0 ? "MALE" : "FEMALE";
}

type Tab = "performance" | "settings";

export function EmployeeDrawer({
  employee,
  branchCodes: initialBranchCodes,
  onClose,
  onSaved,
  onAvatarChange,
  onBranchAdded,
  initialBranchCode,
}: EmployeeDrawerProps) {
  const isEdit = !!employee;

  // Tabs: new employees go straight to Settings (nothing to show in performance yet).
  const [activeTab, setActiveTab] = useState<Tab>(isEdit ? "performance" : "settings");

  // ── Avatar state ──────────────────────────────────────────────────────────
  // When linked to a dispatcher, the dispatcher's avatar is the source of
  // truth — edits go to /api/staff/<dispatcherId>/avatar. Otherwise edits go
  // to /api/employees/<employeeId>/avatar.
  const dispatcherLinked = !!employee?.dispatcherId;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    employee?.dispatcherAvatarUrl ?? employee?.avatarUrl ?? null,
  );

  useEffect(() => {
    setAvatarUrl(employee?.dispatcherAvatarUrl ?? employee?.avatarUrl ?? null);
  }, [employee?.dispatcherAvatarUrl, employee?.avatarUrl]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState(employee?.name ?? "");
  const [icNo, setIcNo] = useState(employee?.rawIcNo ?? "");
  const [epfNo, setEpfNo] = useState(employee?.epfNo ?? "");
  const [socsoNo, setSocsoNo] = useState(employee?.socsoNo ?? "");
  const [incomeTaxNo, setIncomeTaxNo] = useState(employee?.incomeTaxNo ?? "");
  const [type, setType] = useState<EmployeeType>(employee?.type ?? "SUPERVISOR");
  const [branchCode, setBranchCode] = useState(employee?.branchCode ?? initialBranchCode ?? "");
  const [localBranches, setLocalBranches] = useState(initialBranchCodes);

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

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const liveGender = deriveGenderClient(icNo);
  const ringColor =
    liveGender === "MALE"
      ? "var(--color-brand)"
      : liveGender === "FEMALE"
        ? "var(--color-female-ring)"
        : "var(--color-outline-variant)";

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
    if (!branchCode) errs.branchCode = "Branch is required";
    if (icNo.trim() && !/^\d{12}$/.test(icNo)) errs.icNo = "Must be 12 digits";
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
        icNo: icNo.trim() || null,
        type,
        branchCode: branchCode || null,
        epfNo: epfNo.trim() || null,
        socsoNo: socsoNo.trim() || null,
        incomeTaxNo: incomeTaxNo.trim() || null,
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
        // Propagate the CURRENT form values (including cleared tax numbers) so
        // the parent row reflects what was saved. Spreading `...employee` alone
        // leaves stale epfNo/socsoNo/incomeTaxNo in the UI after the user
        // clears them — the PATCH succeeds but the drawer still shows the old
        // value on reopen. Fixes the "cannot remove tax" report.
        const updated: StaffEmployee = {
          ...employee,
          name: name.trim(),
          rawIcNo: icNo.trim(),
          icNo: icNo.trim(),
          type,
          branchCode: branchCode || null,
          isComplete: !!icNo.trim(),
          gender: employee.gender,
          epfNo: epfNo.trim() || null,
          socsoNo: socsoNo.trim() || null,
          incomeTaxNo: incomeTaxNo.trim() || null,
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

  function handleAvatarChange(next: string | null) {
    setAvatarUrl(next);
    if (isEdit && employee) {
      onAvatarChange?.(employee.id, {
        avatarUrl: dispatcherLinked ? employee.avatarUrl : next,
        dispatcherAvatarUrl: dispatcherLinked ? next : employee.dispatcherAvatarUrl,
      });
    }
  }

  // Avatar API base path — route to dispatcher when linked.
  const avatarApiBasePath = dispatcherLinked
    ? `/api/staff/${employee!.dispatcherId}/avatar`
    : isEdit
      ? `/api/employees/${employee!.id}/avatar`
      : undefined; // disabled for new employees (no id yet)

  // Portal the drawer to <body> so no ancestor's `transform`, `filter`, or
  // `contain` CSS creates a new containing block that would break
  // `position: fixed` (the "narrow clipped drawer on the branch page"
  // symptom). Also guarantees the drawer sits above any sticky headers
  // regardless of the z-index soup in the parent tree.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="employee-drawer">
      <div className="absolute inset-0 bg-on-surface/30" onClick={onClose} />
      <div
        className="absolute right-0 top-0 bottom-0 w-120 max-w-full bg-white shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-outline-variant/20">
          {isEdit && avatarApiBasePath ? (
            <DispatcherAvatar
              dispatcherId={dispatcherLinked ? employee!.dispatcherId! : employee!.id}
              name={employee!.name}
              avatarUrl={avatarUrl}
              ringColor={ringColor}
              size="lg"
              apiBasePath={avatarApiBasePath}
              onAvatarChange={handleAvatarChange}
              title={
                dispatcherLinked
                  ? "Avatar shared with linked dispatcher — edits sync both"
                  : "Edit avatar"
              }
            />
          ) : (
            // New employee — no id yet, show silent silhouette
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center bg-surface-low text-[1rem] font-semibold text-on-surface-variant shrink-0"
              style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
              title="Save employee first to add an avatar"
            >
              {name ? name.trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "+"}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface truncate">
              {isEdit ? employee!.name : "New Employee"}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.68rem] font-medium rounded-lg bg-brand/10 text-brand">
                {TYPE_LABEL[type]}
              </span>
              {branchCode && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.68rem] font-medium rounded-lg bg-surface-low text-on-surface-variant tabular-nums">
                  {branchCode}
                </span>
              )}
              {dispatcherLinked && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.68rem] font-medium rounded-lg bg-emerald-100 text-emerald-700"
                  title={`Linked to dispatcher ${employee!.dispatcherExtId ?? ""}`}
                >
                  <Link2 className="w-2.5 h-2.5" /> Dispatcher
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[0.375rem] text-on-surface-variant hover:bg-surface-hover transition-colors self-start cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs — only show Performance when editing an existing employee */}
        {isEdit && (
          <div className="flex items-center gap-1 border-b border-outline-variant/20 px-6 bg-white sticky top-0 z-10">
            <TabButton
              active={activeTab === "performance"}
              onClick={() => setActiveTab("performance")}
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              label="Performance"
            />
            <TabButton
              active={activeTab === "settings"}
              onClick={() => setActiveTab("settings")}
              icon={<Settings className="w-3.5 h-3.5" />}
              label="Settings"
            />
          </div>
        )}

        {/* Body */}
        {isEdit && activeTab === "performance" ? (
          <div className="flex-1 px-6 py-6 overflow-y-auto">
            <EmployeeHistoryTab employeeId={employee!.id} />
          </div>
        ) : (
          <>
            <form id="employee-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Full Name" error={errors.name}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                  placeholder="Enter employee name"
                  className={`w-full px-3 py-2 text-[0.84rem] border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors bg-white ${errors.name ? "border-critical/50" : "border-outline-variant/30"}`}
                />
              </Field>

              <Field label="Position">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTypeOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface transition-colors cursor-pointer"
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
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.84rem] transition-colors cursor-pointer ${type === opt.value ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                        >
                          {opt.label}
                          {type === opt.value && <Check size={13} className="text-brand" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Branch" error={errors.branchCode}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setBranchOpen((o) => !o)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface transition-colors cursor-pointer ${errors.branchCode ? "border-critical/50" : "border-outline-variant/30"}`}
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
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-[0.84rem] transition-colors cursor-pointer ${branchCode === code ? "text-brand font-semibold bg-surface-low" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"}`}
                        >
                          {code}
                          {branchCode === code && <Check size={13} className="text-brand" />}
                        </button>
                      ))}
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
                              className="px-2 py-1 text-[0.72rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {addingBranch ? "..." : "Add"}
                            </button>
                            <button type="button" onClick={() => { setShowAddBranch(false); setNewBranchCode(""); }} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowAddBranch(true)}
                            className="w-full flex items-center gap-2 px-3.5 py-2 text-[0.84rem] text-brand hover:bg-surface-low transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                            Add Branch
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Field>

              <Field label="IC Number" optional error={errors.icNo}>
                <input
                  type="text"
                  value={icNo ? icNo.replace(/(\d{4})(?=\d)/g, "$1-") : ""}
                  onChange={(e) => { setIcNo(e.target.value.replace(/\D/g, "").slice(0, 12)); setErrors((p) => ({ ...p, icNo: "" })); }}
                  placeholder="12-digit IC number"
                  maxLength={14}
                  className={`w-full px-3 py-2 text-[0.84rem] bg-white border rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors tabular-nums ${errors.icNo ? "border-critical/50" : "border-outline-variant/30"}`}
                />
              </Field>

              {type !== "STORE_KEEPER" && (
                <Field label="EPF No" optional>
                  <input
                    type="text"
                    value={epfNo}
                    onChange={(e) => setEpfNo(e.target.value)}
                    placeholder="EPF number"
                    className="w-full px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors"
                  />
                </Field>
              )}

              <Field label="SOCSO No" optional>
                <input
                  type="text"
                  value={socsoNo}
                  onChange={(e) => setSocsoNo(e.target.value)}
                  placeholder="SOCSO number"
                  className="w-full px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors"
                />
              </Field>

              {type === "STORE_KEEPER" && (
                <Field label="Income Tax No" optional>
                  <input
                    type="text"
                    value={incomeTaxNo}
                    onChange={(e) => setIncomeTaxNo(e.target.value)}
                    placeholder="Income tax number"
                    className="w-full px-3 py-2 text-[0.84rem] bg-white border border-outline-variant/30 rounded-[0.375rem] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-colors"
                  />
                </Field>
              )}
            </form>

            {/* Footer — settings only */}
            <div className="px-6 py-4 border-t border-outline-variant/15 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="employee-form"
                disabled={submitting}
                className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Employee"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-[0.78rem] font-medium border-b-2 transition-colors -mb-[1px] cursor-pointer ${
        active
          ? "text-brand border-brand"
          : "text-on-surface-variant border-transparent hover:text-on-surface hover:border-outline-variant/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[0.72rem] font-medium tracking-[0.05em] text-on-surface-variant uppercase mb-1.5">
        {label}
        {optional && <span className="text-on-surface-variant/50 normal-case ml-1">(optional)</span>}
      </label>
      {children}
      {error && <p className="text-[0.68rem] text-critical mt-1">{error}</p>}
    </div>
  );
}
