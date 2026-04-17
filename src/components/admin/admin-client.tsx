"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronRight, Plus, Trash2, X, Eye, LogIn } from "lucide-react";
import { toast } from "sonner";
import type { AdminAgent } from "@/lib/db/admin";

interface PaymentRecord {
  id: string;
  amount: number;
  date: string;
  notes: string | null;
  period: string | null;
  createdAt: string;
}

function formatRM(amount: number) {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminClient({ initialAgents }: { initialAgents: AdminAgent[] }) {
  const [agents, setAgents] = useState(initialAgents);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "pending">("all");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const handleAgentCreated = useCallback(async () => {
    // Refresh agent list from server
    const res = await fetch("/api/admin/agents");
    if (res.ok) {
      const data = await res.json();
      setAgents(data);
    }
    setShowAddAccount(false);
  }, []);

  const filtered = agents.filter((a) => {
    if (filterStatus === "approved" && !a.isApproved) return false;
    if (filterStatus === "pending" && a.isApproved) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 w-64"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "approved", "pending"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-[0.78rem] font-medium rounded-md transition-colors capitalize ${
                filterStatus === status
                  ? "bg-brand text-white"
                  : "text-on-surface-variant hover:bg-surface-hover"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[0.75rem] text-on-surface-variant/60">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowAddAccount(!showAddAccount)}
            className="flex items-center gap-1 px-3 py-1.5 text-[0.78rem] font-medium text-white bg-brand rounded-md hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Add Account
          </button>
        </div>
      </div>

      {showAddAccount && (
        <AddAccountForm onCreated={handleAgentCreated} onCancel={() => setShowAddAccount(false)} />
      )}

      {/* Agent list */}
      <div className="flex flex-col gap-3">
        {filtered.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            isExpanded={expandedAgent === agent.id}
            onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            onUpdate={(updates) =>
              setAgents((prev) =>
                prev.map((a) => (a.id === agent.id ? { ...a, ...updates } : a))
              )
            }
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-[0.85rem] text-on-surface-variant/60 text-center py-8">
            No agents found.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Agent Row ─────────────────────────────────────────── */

function AgentRow({
  agent,
  isExpanded,
  onToggle,
  onUpdate,
}: {
  agent: AdminAgent;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<AdminAgent>) => void;
}) {
  const [togglingApproval, setTogglingApproval] = useState(false);
  const [editingBranches, setEditingBranches] = useState(false);
  const [maxBranchesInput, setMaxBranchesInput] = useState(String(agent.maxBranches));

  const handleImpersonate = useCallback(async () => {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agent.id }),
    });
    // Hard navigation to bust Router Cache — all pages must re-render with new agentId
    window.location.href = "/dashboard";
  }, [agent.id]);

  const handleToggleApproval = useCallback(async () => {
    setTogglingApproval(true);
    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isApproved: !agent.isApproved }),
    });
    setTogglingApproval(false);

    if (!res.ok) {
      toast.error("Failed to update approval");
      return;
    }
    onUpdate({ isApproved: !agent.isApproved });
    toast.success(agent.isApproved ? "Access revoked" : "Agent approved");
  }, [agent.id, agent.isApproved, onUpdate]);

  const handleSaveMaxBranches = useCallback(async () => {
    const val = parseInt(maxBranchesInput, 10);
    if (isNaN(val) || val < 1) {
      toast.error("Must be at least 1");
      return;
    }

    const res = await fetch(`/api/admin/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxBranches: val }),
    });

    if (!res.ok) {
      toast.error("Failed to update");
      return;
    }

    onUpdate({ maxBranches: val });
    setEditingBranches(false);
    toast.success("Branch limit updated");
  }, [agent.id, maxBranchesInput, onUpdate]);

  const memberSince = new Date(agent.createdAt).toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="bg-surface-card rounded-lg border border-outline-variant/15 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Name + email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[0.9rem] font-semibold text-on-surface truncate">
              {agent.name}
            </p>
            {agent.isSuperAdmin && (
              <span className="px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider bg-brand/10 text-brand rounded">
                Admin
              </span>
            )}
          </div>
          <p className="text-[0.78rem] text-on-surface-variant truncate">{agent.email}</p>
        </div>

        {/* Branches */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[0.78rem] text-on-surface-variant">
            {agent.branchCount}/{editingBranches ? "" : agent.maxBranches} branches
          </span>
          {editingBranches ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={maxBranchesInput}
                onChange={(e) => setMaxBranchesInput(e.target.value)}
                className="w-14 px-2 py-0.5 text-[0.78rem] border border-outline-variant rounded text-on-surface text-center"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveMaxBranches();
                  if (e.key === "Escape") setEditingBranches(false);
                }}
              />
              <button
                onClick={handleSaveMaxBranches}
                className="text-[0.72rem] font-medium text-brand hover:text-brand/80"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingBranches(false);
                  setMaxBranchesInput(String(agent.maxBranches));
                }}
                className="text-[0.72rem] text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingBranches(true)}
              className="text-[0.68rem] font-medium text-brand hover:text-brand/80"
            >
              Edit
            </button>
          )}
        </div>

        {/* Member since */}
        <span className="text-[0.75rem] text-on-surface-variant/60 shrink-0 w-20 text-right">
          {memberSince}
        </span>

        {/* Approval toggle */}
        {!agent.isSuperAdmin && (
          <button
            onClick={handleToggleApproval}
            disabled={togglingApproval}
            className={`px-3 py-1 text-[0.75rem] font-medium rounded-md transition-colors shrink-0 ${
              agent.isApproved
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            } disabled:opacity-50`}
          >
            {agent.isApproved ? "Approved" : "Pending"}
          </button>
        )}

        {/* View */}
        <Link
          href={`/admin/view/${agent.id}`}
          className="flex items-center gap-1 px-2.5 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded-md transition-colors shrink-0"
        >
          <Eye size={12} />
          View
        </Link>

        {/* Impersonate */}
        {!agent.isSuperAdmin && (
          <button
            onClick={handleImpersonate}
            className="flex items-center gap-1 px-2.5 py-1 text-[0.72rem] font-medium text-amber-600 hover:bg-amber-50 rounded-md transition-colors shrink-0"
          >
            <LogIn size={12} />
            Sign in
          </button>
        )}

        {/* Expand */}
        <button
          onClick={onToggle}
          className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Branch codes + add branch */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
        {agent.branches.map((code) => (
          <span
            key={code}
            className="px-2 py-0.5 text-[0.72rem] font-medium text-on-surface-variant bg-surface-low rounded"
          >
            {code}
          </span>
        ))}
        <AddBranchInline
          agentId={agent.id}
          onAdded={(code) => onUpdate({ branches: [...agent.branches, code], branchCount: agent.branchCount + 1 })}
        />
      </div>

      {/* Expanded: Payment history */}
      {isExpanded && (
        <div className="border-t border-outline-variant/15 px-5 py-4">
          <PaymentHistory agentId={agent.id} />
        </div>
      )}
    </div>
  );
}

/* ─── Payment History ───────────────────────────────────── */

function PaymentHistory({ agentId }: { agentId: string }) {
  const [records, setRecords] = useState<PaymentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Load on mount
  useState(() => {
    fetch(`/api/admin/payments?agentId=${agentId}`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  const handleAddPayment = useCallback(
    async (data: { amount: number; date: string; notes: string; period: string }) => {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, ...data }),
      });

      if (!res.ok) {
        toast.error("Failed to add payment");
        return;
      }

      const record = await res.json();
      setRecords((prev) => (prev ? [record, ...prev] : [record]));
      setShowForm(false);
      toast.success("Payment recorded");
    },
    [agentId],
  );

  const handleDelete = useCallback(async (paymentId: string) => {
    const res = await fetch(`/api/admin/payments/${paymentId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error("Failed to delete");
      return;
    }

    setRecords((prev) => (prev ? prev.filter((r) => r.id !== paymentId) : null));
    toast.success("Payment deleted");
  }, []);

  if (loading) {
    return <p className="text-[0.82rem] text-on-surface-variant/60">Loading payments...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[0.82rem] font-semibold text-on-surface">Payment History</h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-[0.75rem] font-medium text-brand hover:bg-brand/5 rounded-md transition-colors"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancel" : "Add Payment"}
        </button>
      </div>

      {showForm && (
        <PaymentForm onSubmit={handleAddPayment} />
      )}

      {records && records.length > 0 ? (
        <div className="flex flex-col gap-1">
          {records.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-hover transition-colors group"
            >
              <span className="text-[0.82rem] font-medium text-on-surface tabular-nums w-28">
                RM {formatRM(r.amount)}
              </span>
              <span className="text-[0.78rem] text-on-surface-variant w-24">
                {formatDate(r.date)}
              </span>
              <span className="text-[0.78rem] text-on-surface-variant flex-1 truncate">
                {r.period || "—"}
              </span>
              <span className="text-[0.75rem] text-on-surface-variant/50 flex-1 truncate">
                {r.notes || ""}
              </span>
              <button
                onClick={() => handleDelete(r.id)}
                className="p-1 text-on-surface-variant/30 hover:text-critical rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.78rem] text-on-surface-variant/50">No payment records yet.</p>
      )}
    </div>
  );
}

/* ─── Payment Form ──────────────────────────────────────── */

function PaymentForm({
  onSubmit,
}: {
  onSubmit: (data: { amount: number; date: string; notes: string; period: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    await onSubmit({ amount: val, date, notes, period });
    setSaving(false);
  };

  const inputClass =
    "px-2.5 py-1.5 text-[0.82rem] border border-outline-variant/30 rounded-md text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-brand/40";

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 p-3 bg-surface-low rounded-md">
      <div className="flex flex-col gap-0.5">
        <label className="text-[0.65rem] font-medium text-on-surface-variant uppercase tracking-wider">
          Amount (RM)
        </label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={inputClass + " w-28"}
          required
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-[0.65rem] font-medium text-on-surface-variant uppercase tracking-wider">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass + " w-36"}
          required
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-[0.65rem] font-medium text-on-surface-variant uppercase tracking-wider">
          Period
        </label>
        <input
          type="text"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="e.g. Mar 2026 – Feb 2027"
          className={inputClass + " w-52"}
        />
      </div>
      <div className="flex flex-col gap-0.5 flex-1">
        <label className="text-[0.65rem] font-medium text-on-surface-variant uppercase tracking-wider">
          Notes
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-1.5 text-[0.78rem] font-medium text-white bg-brand rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? "Saving..." : "Add"}
      </button>
    </form>
  );
}

/* ─── Add Branch Inline ─────────────────────────────────── */

function AddBranchInline({
  agentId,
  onAdded,
}: {
  agentId: string;
  onAdded: (code: string) => void;
}) {
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
      const data = await res.json();
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
        className="px-2 py-0.5 text-[0.72rem] font-medium text-brand border border-dashed border-brand/30 rounded hover:bg-brand/5 transition-colors"
      >
        + Branch
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="PHG123"
        className="w-20 px-2 py-0.5 text-[0.72rem] border border-outline-variant rounded text-on-surface uppercase"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
          if (e.key === "Escape") { setEditing(false); setCode(""); }
        }}
      />
      <button
        onClick={handleAdd}
        disabled={saving || !code.trim()}
        className="text-[0.68rem] font-medium text-brand hover:text-brand/80 disabled:opacity-50"
      >
        {saving ? "..." : "Add"}
      </button>
      <button
        onClick={() => { setEditing(false); setCode(""); }}
        className="text-[0.68rem] text-on-surface-variant hover:text-on-surface"
      >
        Cancel
      </button>
    </div>
  );
}

/* ─── Add Account Form ──────────────────────────────────── */

function AddAccountForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [maxBranches, setMaxBranches] = useState("1");
  const [regNo, setRegNo] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password) {
      toast.error("Email, name, and password are required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        name: name.trim(),
        password,
        isApproved: true,
        maxBranches: parseInt(maxBranches, 10) || 1,
        companyRegistrationNo: regNo.trim() || undefined,
        companyAddress: address.trim() || undefined,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Failed to create account");
      return;
    }

    toast.success("Account created");
    onCreated();
  }

  const inputClass =
    "w-full px-3 py-2 text-[0.82rem] border border-outline-variant/30 rounded-md text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-brand/40";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-card rounded-lg border border-brand/20 p-6 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[0.9rem] font-semibold text-on-surface">New Account</h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-on-surface-variant hover:text-on-surface rounded-md hover:bg-surface-hover transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@example.com"
            className={inputClass}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Company Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company Sdn Bhd"
            className={inputClass}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Password *
          </label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className={inputClass}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Max Branches
          </label>
          <input
            type="number"
            min={1}
            value={maxBranches}
            onChange={(e) => setMaxBranches(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Registration No
          </label>
          <input
            type="text"
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="e.g. 202401013061"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider">
            Company Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full address"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 text-[0.82rem] font-medium text-white bg-brand rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create Account"}
        </button>
      </div>
    </form>
  );
}
