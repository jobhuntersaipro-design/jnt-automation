"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Plus, Send, Trash2, X, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminAgent } from "@/lib/db/admin";
import { billableMonths, firstBillableMonth, type YearMonth } from "@/lib/billing";
import {
  BILLING_CHIP,
  describeLimitChange,
  formatDate,
  formatMonth,
  formatRM,
  limitChangeActor,
  monthBill,
  trialInfo,
} from "./admin-shared";

export interface BillingActions {
  markPaid: (agent: AdminAgent, ym: YearMonth, paid: boolean) => void;
  sendInvoice: (agent: AdminAgent, ym: YearMonth) => void;
}

const MONTHS_SHOWN = 24;

const inputClass =
  "w-full px-3 py-2 text-base sm:text-[0.82rem] border border-outline-variant/30 rounded-md text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-brand/40";
const labelClass = "text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider";

export function AgentDrawer({
  agent,
  onClose,
  onUpdate,
  billing,
}: {
  agent: AdminAgent;
  onClose: () => void;
  onUpdate: (updates: Partial<AdminAgent>) => void;
  billing: BillingActions;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trial = trialInfo(agent.createdAt);
  const months = billableMonths(agent.createdAt).slice(0, MONTHS_SHOWN);

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="agent-drawer">
      <div className="absolute inset-0 bg-on-surface/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-140 max-w-full bg-surface-card shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] flex flex-col animate-slide-in-right">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-outline-variant/20">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[1.05rem] font-semibold text-on-surface truncate">{agent.name || agent.email}</h2>
              {agent.isSuperAdmin && (
                <span className="px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider bg-brand/10 text-brand rounded">
                  Admin
                </span>
              )}
            </div>
            <p className="text-[0.8rem] text-on-surface-variant truncate">{agent.email}</p>
            <p className="text-[0.75rem] text-on-surface-variant/70 mt-1">
              Joined {formatDate(agent.createdAt)} · Trial {trial.active ? "ends" : "ended"} {formatDate(trial.end)}
              {trial.active && ` (${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left)`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-8">
          <ProfileForm agent={agent} onUpdate={onUpdate} />

          <section className="flex flex-col gap-2">
            <h3 className="text-[0.85rem] font-semibold text-on-surface">
              Branches <span className="font-normal text-on-surface-variant">· {agent.branchCount} of {agent.maxBranches} used</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {agent.branches.map((code) => (
                <span key={code} className="px-2 py-0.5 text-[0.75rem] font-medium text-on-surface-variant bg-surface-low rounded">
                  {code}
                </span>
              ))}
              {agent.hasDemo && (
                <span className="px-2 py-0.5 text-[0.75rem] text-on-surface-variant/60 bg-surface-low rounded">+ sample data</span>
              )}
              <AddBranchInline
                agentId={agent.id}
                onAdded={(code) => onUpdate({ branches: [...agent.branches, code].sort(), branchCount: agent.branchCount + 1 })}
              />
            </div>
          </section>

          {!agent.isSuperAdmin && (
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[0.85rem] font-semibold text-on-surface">Billing</h3>
                <span className="text-[0.72rem] text-on-surface-variant">
                  {agent.maxBranches} branch{agent.maxBranches === 1 ? "" : "es"} × RM 150 = {formatRM(agent.maxBranches * 150)}/month
                </span>
              </div>
              {months.length === 0 ? (
                <p className="text-[0.8rem] text-on-surface-variant/70">
                  Free trial — first invoice is for {formatMonth(firstBillableMonth(agent.createdAt))}.
                </p>
              ) : (
                <div className="flex flex-col">
                  {months.map((ym) => {
                    const bill = monthBill(agent, ym);
                    const chip = BILLING_CHIP[bill.status];
                    const paid = bill.status === "paid";
                    return (
                      <div key={`${ym.year}-${ym.month}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-2 -mx-2 rounded-md hover:bg-surface-low">
                        <span className="w-20 text-[0.82rem] font-medium text-on-surface">{formatMonth(ym)}</span>
                        <span className="w-24 text-[0.82rem] tabular-nums text-on-surface">{formatRM(bill.amount)}</span>
                        <span className={`px-2 py-0.5 text-[0.7rem] font-semibold rounded ${chip.className}`}>{chip.label}</span>
                        <span className="flex-1 min-w-24 text-[0.7rem] text-on-surface-variant/70">
                          {bill.invoice?.paidAt
                            ? `Paid ${formatDate(bill.invoice.paidAt)}`
                            : bill.invoice?.sentAt
                              ? `Sent ${formatDate(bill.invoice.sentAt)}`
                              : "Not sent"}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => billing.markPaid(agent, ym, !paid)}
                            className={`flex items-center gap-1 px-2 py-1 text-[0.72rem] font-medium rounded-md transition-colors ${
                              paid ? "text-on-surface-variant hover:bg-surface-hover" : "text-emerald-700 hover:bg-emerald-50"
                            }`}
                          >
                            {paid ? <Undo2 size={12} /> : <Check size={12} />}
                            {paid ? "Unpaid" : "Mark paid"}
                          </button>
                          <button
                            onClick={() => billing.sendInvoice(agent, ym)}
                            className="flex items-center gap-1 px-2 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded-md"
                          >
                            <Send size={12} />
                            {paid ? "Receipt" : "Send"}
                          </button>
                          <a
                            href={`/api/admin/agents/${agent.id}/invoices/${ym.year}/${ym.month}`}
                            title="Download PDF"
                            aria-label={`Download ${formatMonth(ym)} invoice PDF`}
                            className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-hover rounded-md"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-[0.85rem] font-semibold text-on-surface">Branch limit history</h3>
            {agent.limitChanges.length === 0 ? (
              <p className="text-[0.8rem] text-on-surface-variant/60">No changes yet — still at {agent.maxBranches}.</p>
            ) : (
              agent.limitChanges.map((c, i) => (
                <div key={`${c.createdAt}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
                  <span className="w-40 text-[0.78rem] text-on-surface-variant tabular-nums whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className={`text-[0.82rem] font-medium tabular-nums ${c.toLimit > c.fromLimit ? "text-emerald-700" : "text-amber-700"}`}>
                    {describeLimitChange(c)}
                  </span>
                  <span className="text-[0.75rem] text-on-surface-variant">
                    {limitChangeActor(c)}
                    {c.actorEmail && c.actorEmail !== agent.email ? ` (${c.actorEmail})` : ""}
                  </span>
                </div>
              ))
            )}
          </section>

          <PaymentHistory agentId={agent.id} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Profile ───────────────────────────────────────────── */

function ProfileForm({ agent, onUpdate }: { agent: AdminAgent; onUpdate: (u: Partial<AdminAgent>) => void }) {
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone ?? "");
  const [maxBranches, setMaxBranches] = useState(String(agent.maxBranches));
  const [notes, setNotes] = useState(agent.adminNotes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== agent.name ||
    phone !== (agent.phone ?? "") ||
    maxBranches !== String(agent.maxBranches) ||
    notes !== (agent.adminNotes ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const max = parseInt(maxBranches, 10);
    if (!name.trim()) return toast.error("Name is required");
    if (isNaN(max) || max < 1) return toast.error("Branch limit must be at least 1");

    setSaving(true);
    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone, maxBranches: max, adminNotes: notes }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Failed to save");

    const limitChanges =
      data.maxBranches !== agent.maxBranches
        ? [
            {
              fromLimit: agent.maxBranches,
              toLimit: data.maxBranches,
              changedBy: "admin" as const,
              actorEmail: null,
              createdAt: new Date().toISOString(),
            },
            ...agent.limitChanges,
          ]
        : agent.limitChanges;
    onUpdate({ name: data.name, phone: data.phone, maxBranches: data.maxBranches, adminNotes: data.adminNotes, limitChanges });
    setPhone(data.phone ?? "");
    setNotes(data.adminNotes ?? "");
    toast.success("Saved");
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <h3 className="text-[0.85rem] font-semibold text-on-surface">Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>WhatsApp</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="012-345 6789" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Branch limit</span>
          <input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Only visible to admins"
          className={inputClass + " resize-y"}
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 px-4 py-2 text-[0.8rem] font-medium text-white bg-brand rounded-md hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Save changes
        </button>
      </div>
    </form>
  );
}

/* ─── Add Branch Inline ─────────────────────────────────── */

function AddBranchInline({ agentId, onAdded }: { agentId: string; onAdded: (code: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!code.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/admin/agents/${agentId}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to add branch");
      return;
    }
    onAdded(code.trim().toUpperCase());
    setCode("");
    setEditing(false);
    toast.success("Branch added");
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="px-2 py-0.5 text-[0.75rem] font-medium text-brand border border-dashed border-brand/30 rounded hover:bg-brand/5"
      >
        + Branch
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="PHG123"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") { setEditing(false); setCode(""); }
        }}
        className="w-24 px-2 py-0.5 text-base sm:text-[0.75rem] border border-outline-variant rounded text-on-surface uppercase"
      />
      <button onClick={handleAdd} disabled={saving || !code.trim()} className="text-[0.72rem] font-medium text-brand disabled:opacity-50">
        {saving ? "..." : "Add"}
      </button>
      <button onClick={() => { setEditing(false); setCode(""); }} className="text-[0.72rem] text-on-surface-variant">
        Cancel
      </button>
    </div>
  );
}

/* ─── Other payment records (free-form, pre-invoice) ────── */

interface PaymentRecord {
  id: string;
  amount: number;
  date: string;
  notes: string | null;
  period: string | null;
}

function PaymentHistory({ agentId }: { agentId: string }) {
  const [records, setRecords] = useState<PaymentRecord[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/payments?agentId=${agentId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [agentId]);

  const handleAdd = useCallback(
    async (data: { amount: number; date: string; notes: string; period: string }) => {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, ...data }),
      });
      if (!res.ok) return toast.error("Failed to add payment");
      const record = await res.json();
      setRecords((prev) => [record, ...(prev ?? [])]);
      setShowForm(false);
      toast.success("Payment recorded");
    },
    [agentId],
  );

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/payments/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Failed to delete");
    setRecords((prev) => prev?.filter((r) => r.id !== id) ?? null);
    toast.success("Payment deleted");
  }, []);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.85rem] font-semibold text-on-surface">Other payments</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] font-medium text-brand hover:bg-brand/5 rounded-md"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancel" : "Add payment"}
        </button>
      </div>
      {showForm && <PaymentForm onSubmit={handleAdd} />}
      {records === null ? (
        <p className="text-[0.8rem] text-on-surface-variant/60">Loading…</p>
      ) : records.length === 0 ? (
        <p className="text-[0.8rem] text-on-surface-variant/60">No other payments recorded.</p>
      ) : (
        records.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-surface-low group">
            <span className="w-28 text-[0.82rem] font-medium tabular-nums text-on-surface">{formatRM(r.amount)}</span>
            <span className="w-24 text-[0.78rem] text-on-surface-variant">{formatDate(r.date)}</span>
            <span className="flex-1 truncate text-[0.78rem] text-on-surface-variant">
              {[r.period, r.notes].filter(Boolean).join(" · ") || "—"}
            </span>
            <button
              onClick={() => handleDelete(r.id)}
              aria-label="Delete payment"
              className="p-1 text-on-surface-variant/40 hover:text-critical rounded sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))
      )}
    </section>
  );
}

function PaymentForm({ onSubmit }: { onSubmit: (d: { amount: number; date: string; notes: string; period: string }) => Promise<unknown> }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    await onSubmit({ amount: val, date, notes, period });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 p-3 bg-surface-low rounded-md">
      <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (RM)" className={inputClass} required />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} required />
      <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period (optional)" className={inputClass} />
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className={inputClass} />
      <button type="submit" disabled={saving} className="col-span-2 py-2 text-[0.8rem] font-medium text-white bg-brand rounded-md disabled:opacity-50">
        {saving ? "Saving…" : "Add payment"}
      </button>
    </form>
  );
}
