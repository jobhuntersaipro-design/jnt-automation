"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Eye,
  LogIn,
  MessageCircle,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AdminAgent } from "@/lib/db/admin";
import { monthKey, whatsappLink, type BillingStatus, type YearMonth } from "@/lib/billing";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { AgentDrawer, type BillingActions } from "./agent-drawer";
import {
  BILLING_CHIP,
  describeLimitChange,
  limitChangeActor,
  formatDate,
  formatMonth,
  formatRM,
  monthBill,
  trialInfo,
  type AdminInvoice,
} from "./admin-shared";

type StatusFilter = "all" | "approved" | "pending";
type BillingFilter = "all" | BillingStatus;
type SortKey = "name" | "email" | "branches" | "joined" | "trial" | "billing" | "status";

const BILLING_ORDER: Record<BillingStatus, number> = { unpaid: 0, paid: 1, trial: 2, exempt: 3 };

function currentMonth(): YearMonth {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** The current month plus the 11 before it, newest first. */
function monthOptions(): YearMonth[] {
  const k = monthKey(currentMonth());
  return Array.from({ length: 12 }, (_, i) => ({ year: Math.floor((k - i) / 12), month: ((k - i) % 12) + 1 }));
}

export function AdminClient({ initialAgents, currentUserId }: { initialAgents: AdminAgent[]; currentUserId: string }) {
  const [agents, setAgents] = useState(initialAgents);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [billingFilter, setBillingFilter] = useState<BillingFilter>("all");
  const [month, setMonth] = useState<YearMonth>(currentMonth);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "joined", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [showAddAccount, setShowAddAccount] = useState(false);

  const updateAgent = useCallback((id: string, updates: Partial<AdminAgent>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const putInvoice = useCallback((id: string, inv: AdminInvoice) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, invoices: [inv, ...a.invoices.filter((i) => i.year !== inv.year || i.month !== inv.month)] }
          : a,
      ),
    );
  }, []);

  const handleAgentCreated = useCallback(async () => {
    const res = await fetch("/api/admin/agents");
    if (res.ok) setAgents(await res.json());
    setShowAddAccount(false);
  }, []);

  /* ─── Actions (all behind a confirmation) ─── */

  const requestStatusChange = useCallback((agent: AdminAgent, isApproved: boolean) => {
    setConfirm({
      title: isApproved ? "Approve this account?" : "Set this account to pending?",
      body: isApproved ? (
        <>
          <strong className="text-on-surface">{agent.name || agent.email}</strong> will be able to sign in and use
          EasyStaff. They&apos;ll get an approval email.
        </>
      ) : (
        <>
          <strong className="text-on-surface">{agent.name || agent.email}</strong> will lose access straight away and
          see the &ldquo;awaiting approval&rdquo; page until you approve them again. Their data is kept.
        </>
      ),
      confirmLabel: isApproved ? "Approve" : "Set to pending",
      tone: isApproved ? "primary" : "danger",
      onConfirm: async () => {
        const res = await fetch(`/api/admin/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isApproved }),
        });
        if (!res.ok) {
          toast.error("Failed to update status");
          return false;
        }
        updateAgent(agent.id, { isApproved });
        toast.success(isApproved ? "Account approved" : "Access revoked");
      },
    });
  }, [updateAgent]);

  const requestDelete = useCallback((agent: AdminAgent) => {
    setConfirm({
      title: "Delete this account?",
      body: (
        <>
          This permanently deletes <strong className="text-on-surface">{agent.name || agent.email}</strong> and all of
          their branches, dispatchers, staff, uploads, payroll records and invoices. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete account",
      tone: "danger",
      requireText: agent.email,
      onConfirm: async () => {
        const res = await fetch(`/api/admin/agents/${agent.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to delete account");
          return false;
        }
        setAgents((prev) => prev.filter((a) => a.id !== agent.id));
        setOpenId((id) => (id === agent.id ? null : id));
        toast.success("Account deleted");
      },
    });
  }, []);

  const billing: BillingActions = useMemo(() => ({
    markPaid: (agent, ym, paid) => {
      const bill = monthBill(agent, ym);
      setConfirm({
        title: paid ? `Mark ${formatMonth(ym)} as paid?` : `Mark ${formatMonth(ym)} as unpaid?`,
        body: paid ? (
          <>
            Record <strong className="text-on-surface">{formatRM(bill.amount)}</strong> from{" "}
            <strong className="text-on-surface">{agent.name || agent.email}</strong> for {formatMonth(ym)}.
          </>
        ) : (
          <>Clears the payment recorded for {formatMonth(ym)}. The amount will follow their current branch limit again.</>
        ),
        confirmLabel: paid ? "Mark paid" : "Mark unpaid",
        tone: paid ? "primary" : "danger",
        onConfirm: async () => {
          const res = await fetch(`/api/admin/agents/${agent.id}/invoices/${ym.year}/${ym.month}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paid }),
          });
          if (!res.ok) {
            toast.error("Failed to update payment");
            return false;
          }
          putInvoice(agent.id, await res.json());
          toast.success(paid ? "Marked as paid" : "Marked as unpaid");
        },
      });
    },
    sendInvoice: (agent, ym) => {
      const bill = monthBill(agent, ym);
      const paid = bill.status === "paid";
      setConfirm({
        title: paid ? `Email ${formatMonth(ym)} receipt?` : `Send ${formatMonth(ym)} invoice?`,
        body: (
          <>
            Emails a PDF {paid ? "receipt" : "invoice"} for <strong className="text-on-surface">{formatRM(bill.amount)}</strong>
            {!paid && <> ({agent.maxBranches} branch{agent.maxBranches === 1 ? "" : "es"} × RM 150)</>} to{" "}
            <strong className="text-on-surface">{agent.email}</strong>.
            {bill.invoice?.sentAt && <> It was already sent on {formatDate(bill.invoice.sentAt)}.</>}
          </>
        ),
        confirmLabel: paid ? "Send receipt" : "Send invoice",
        onConfirm: async () => {
          const res = await fetch(`/api/admin/agents/${agent.id}/invoices/${ym.year}/${ym.month}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(data.error || "Failed to send invoice");
            return false;
          }
          putInvoice(agent.id, data);
          toast.success(`Invoice sent to ${agent.email}`);
        },
      });
    },
  }), [putInvoice]);

  const handleImpersonate = useCallback(async (agentId: string) => {
    await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    // Hard navigation to bust Router Cache — all pages must re-render with new agentId
    window.location.href = "/dashboard";
  }, []);

  /* ─── Filter + sort ─── */

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = agents
      .map((agent) => ({ agent, bill: monthBill(agent, month), trialEnd: trialInfo(agent.createdAt).end }))
      .filter(({ agent, bill }) => {
        if (statusFilter === "approved" && !agent.isApproved) return false;
        if (statusFilter === "pending" && agent.isApproved) return false;
        if (billingFilter !== "all" && bill.status !== billingFilter) return false;
        if (!q) return true;
        return [agent.name, agent.email, agent.phone, agent.adminNotes, ...agent.branches]
          .some((v) => v?.toLowerCase().includes(q));
      });

    const dir = sort.dir === "asc" ? 1 : -1;
    const value = (r: (typeof list)[number]): string | number => {
      switch (sort.key) {
        case "name": return r.agent.name.toLowerCase();
        case "email": return r.agent.email.toLowerCase();
        case "branches": return r.agent.maxBranches;
        case "joined": return r.agent.createdAt;
        case "trial": return r.trialEnd.getTime();
        case "billing": return BILLING_ORDER[r.bill.status];
        case "status": return r.agent.isApproved ? 1 : 0;
      }
    };
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  }, [agents, search, statusFilter, billingFilter, month, sort]);

  const totals = useMemo(() => {
    const t = { paid: 0, paidCount: 0, unpaid: 0, unpaidCount: 0, trialCount: 0 };
    for (const agent of agents) {
      const bill = monthBill(agent, month);
      if (bill.status === "paid") { t.paid += bill.amount; t.paidCount++; }
      if (bill.status === "unpaid") { t.unpaid += bill.amount; t.unpaidCount++; }
      if (bill.status === "trial") t.trialCount++;
    }
    return t;
  }, [agents, month]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "joined" ? "desc" : "asc" }));

  const openAgent = agents.find((a) => a.id === openId) ?? null;
  const monthLabel = formatMonth(month);

  return (
    <div className="flex flex-col gap-5">
      {/* Month summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label={`Paid · ${monthLabel}`} value={formatRM(totals.paid)} sub={`${totals.paidCount} account${totals.paidCount === 1 ? "" : "s"}`} tone="text-emerald-700" onClick={() => setBillingFilter("paid")} />
        <SummaryCard label={`Unpaid · ${monthLabel}`} value={formatRM(totals.unpaid)} sub={`${totals.unpaidCount} account${totals.unpaidCount === 1 ? "" : "s"}`} tone="text-critical" onClick={() => setBillingFilter("unpaid")} />
        <SummaryCard label="In free trial" value={String(totals.trialCount)} sub={`during ${monthLabel}`} tone="text-brand" onClick={() => setBillingFilter("trial")} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 sm:flex-none">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, email, WhatsApp, branch, notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-base sm:text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 w-full sm:w-80"
          />
        </div>
        <Select label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)} options={[["all", "All statuses"], ["approved", "Approved"], ["pending", "Pending"]]} />
        <Select label="Billing" value={billingFilter} onChange={(v) => setBillingFilter(v as BillingFilter)} options={[["all", "All billing"], ["unpaid", "Unpaid"], ["paid", "Paid"], ["trial", "In trial"]]} />
        <Select
          label="Billing month"
          value={`${month.year}-${month.month}`}
          onChange={(v) => { const [y, m] = v.split("-").map(Number); setMonth({ year: y, month: m }); }}
          options={monthOptions().map((ym) => [`${ym.year}-${ym.month}`, formatMonth(ym)] as [string, string])}
        />
        {(search || statusFilter !== "all" || billingFilter !== "all") && (
          <button
            onClick={() => { setSearch(""); setStatusFilter("all"); setBillingFilter("all"); }}
            className="flex items-center gap-1 px-2 py-1.5 text-[0.75rem] text-on-surface-variant hover:text-on-surface"
          >
            <X size={12} /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[0.75rem] text-on-surface-variant/70">
            {rows.length} of {agents.length} account{agents.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => setShowAddAccount(!showAddAccount)}
            className="flex items-center gap-1 px-3 py-1.5 text-[0.78rem] font-medium text-white bg-brand rounded-md hover:opacity-90"
          >
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {showAddAccount && <AddAccountForm onCreated={handleAgentCreated} onCancel={() => setShowAddAccount(false)} />}

      {/* Table */}
      <div className="bg-surface-card rounded-lg border border-outline-variant/15 overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left">
          <thead>
            <tr className="text-[0.68rem] font-semibold uppercase tracking-wider text-on-surface-variant bg-surface-low">
              <Th label="Name" k="name" sort={sort} onSort={toggleSort} />
              <Th label="Email" k="email" sort={sort} onSort={toggleSort} />
              <th className="px-2.5 py-2.5">WhatsApp</th>
              <Th label="Branches" k="branches" sort={sort} onSort={toggleSort} />
              <Th label="Joined" k="joined" sort={sort} onSort={toggleSort} />
              <Th label="Trial ends" k="trial" sort={sort} onSort={toggleSort} />
              <Th label={`Bill · ${monthLabel}`} k="billing" sort={sort} onSort={toggleSort} />
              <Th label="Status" k="status" sort={sort} onSort={toggleSort} />
              <th className="px-2.5 py-2.5">Notes</th>
              <th className="px-2.5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, bill, trialEnd }) => {
              const trial = trialInfo(agent.createdAt);
              const chip = BILLING_CHIP[bill.status];
              const billable = bill.status === "paid" || bill.status === "unpaid";
              return (
                <tr key={agent.id} className="text-[0.8rem] text-on-surface-variant hover:bg-surface-low transition-colors align-top">
                  <td className="px-2.5 py-3 min-w-36">
                    <button onClick={() => setOpenId(agent.id)} className="text-left font-semibold text-on-surface hover:text-brand">
                      {agent.name || "—"}
                    </button>
                    {agent.isSuperAdmin && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider bg-brand/10 text-brand rounded">Admin</span>
                    )}
                  </td>
                  <td className="px-2.5 py-3 max-w-52 truncate" title={agent.email}>{agent.email}</td>
                  <td className="px-2.5 py-3 whitespace-nowrap">
                    {agent.phone ? (
                      <a href={whatsappLink(agent.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                        <MessageCircle size={12} /> {agent.phone}
                      </a>
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="px-2.5 py-3">
                    <div className="tabular-nums text-on-surface">{agent.branchCount}/{agent.maxBranches}</div>
                    <div className="flex flex-wrap gap-1 mt-1 max-w-44">
                      {agent.branches.slice(0, 3).map((code) => (
                        <span key={code} className="px-1.5 py-0.5 text-[0.68rem] font-medium bg-surface-low rounded">{code}</span>
                      ))}
                      {agent.branches.length > 3 && (
                        <span className="px-1.5 py-0.5 text-[0.68rem] text-on-surface-variant/70">+{agent.branches.length - 3}</span>
                      )}
                    </div>
                    {agent.limitChanges[0] && (
                      <button
                        onClick={() => setOpenId(agent.id)}
                        title={`${agent.limitChanges.length} limit change${agent.limitChanges.length === 1 ? "" : "s"} — open history`}
                        className="mt-1 block text-left text-[0.68rem] text-on-surface-variant/70 hover:text-brand whitespace-nowrap"
                      >
                        {describeLimitChange(agent.limitChanges[0])} · {limitChangeActor(agent.limitChanges[0])} ·{" "}
                        {formatDate(agent.limitChanges[0].createdAt)}
                      </button>
                    )}
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap">{formatDate(agent.createdAt)}</td>
                  <td className="px-2.5 py-3 whitespace-nowrap">
                    {agent.isSuperAdmin ? (
                      <span className="text-on-surface-variant/40">—</span>
                    ) : (
                      <>
                        <div className={trial.active ? "text-on-surface" : ""}>{formatDate(trialEnd)}</div>
                        <div className="text-[0.7rem] text-on-surface-variant/70">
                          {trial.active ? `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left` : "Ended"}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[0.7rem] font-semibold rounded ${chip.className}`}>{chip.label}</span>
                      {billable && <span className="tabular-nums text-on-surface">{formatRM(bill.amount)}</span>}
                    </div>
                    {billable && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {bill.status === "unpaid" && (
                          <button onClick={() => billing.markPaid(agent, month, true)} className="inline-flex items-center gap-0.5 text-[0.7rem] font-medium text-emerald-700 hover:underline">
                            <Check size={11} /> Mark paid
                          </button>
                        )}
                        <button onClick={() => billing.sendInvoice(agent, month)} className="inline-flex items-center gap-0.5 text-[0.7rem] font-medium text-brand hover:underline">
                          <Send size={11} /> {bill.invoice?.sentAt ? "Resend" : bill.status === "paid" ? "Receipt" : "Send invoice"}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-3">
                    {agent.isSuperAdmin ? (
                      <span className="text-[0.75rem] text-on-surface-variant/60">Superadmin</span>
                    ) : (
                      <select
                        aria-label={`Status for ${agent.email}`}
                        value={agent.isApproved ? "approved" : "pending"}
                        onChange={(e) => requestStatusChange(agent, e.target.value === "approved")}
                        className={`px-2 py-1 text-base sm:text-[0.75rem] font-medium rounded-md border-0 cursor-pointer outline-none focus:ring-2 focus:ring-brand/30 ${
                          agent.isApproved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                      </select>
                    )}
                  </td>
                  <td className="px-2.5 py-3 max-w-40">
                    <button
                      onClick={() => setOpenId(agent.id)}
                      title={agent.adminNotes ?? "Add notes"}
                      className="block w-full text-left truncate hover:text-on-surface"
                    >
                      {agent.adminNotes || <span className="text-on-surface-variant/40">Add notes</span>}
                    </button>
                  </td>
                  <td className="px-2.5 py-3">
                    <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
                      <IconLink href={`/admin/view/${agent.id}`} label="View data"><Eye size={14} /></IconLink>
                      {!agent.isSuperAdmin && (
                        <IconButton label="Sign in as this account" onClick={() => handleImpersonate(agent.id)} className="text-amber-600 hover:bg-amber-50">
                          <LogIn size={14} />
                        </IconButton>
                      )}
                      <button
                        onClick={() => setOpenId(agent.id)}
                        className="px-2 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded-md"
                      >
                        Manage
                      </button>
                      {!agent.isSuperAdmin && agent.id !== currentUserId && (
                        <IconButton label="Delete account" onClick={() => requestDelete(agent)} className="text-on-surface-variant/60 hover:text-critical hover:bg-red-50">
                          <Trash2 size={14} />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[0.85rem] text-on-surface-variant/60">
                  No accounts match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openAgent && (
        <AgentDrawer
          key={openAgent.id}
          agent={openAgent}
          onClose={() => setOpenId(null)}
          onUpdate={(u) => updateAgent(openAgent.id, u)}
          billing={billing}
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* ─── Small pieces ──────────────────────────────────────── */

function SummaryCard({ label, value, sub, tone, onClick }: { label: string; value: string; sub: string; tone: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-surface-card rounded-lg border border-outline-variant/15 px-4 py-3 hover:bg-surface-low transition-colors">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className={`text-[1.25rem] font-bold tabular-nums mt-0.5 ${tone}`}>{value}</p>
      <p className="text-[0.72rem] text-on-surface-variant/70">{sub}</p>
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-base sm:text-[0.8rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface outline-none focus:border-brand/40 cursor-pointer"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function Th({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-2.5 py-2.5" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-on-surface ${active ? "text-on-surface" : ""}`}>
        {label}
        <Icon size={11} className={active ? "" : "opacity-40"} />
      </button>
    </th>
  );
}

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className={`p-1.5 rounded-md transition-colors ${className}`}>
      {children}
    </button>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} title={label} aria-label={label} className="p-1.5 rounded-md text-brand hover:bg-brand/5 transition-colors">
      {children}
    </Link>
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
  const [phone, setPhone] = useState("");
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
        phone: phone.trim() || undefined,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
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
            WhatsApp
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="012-345 6789"
            className={inputClass}
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
