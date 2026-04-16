"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Building2, Users, FileText, Eye } from "lucide-react";
import type { AgentView } from "@/lib/db/admin";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatRM(amount: number) {
  return amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Tab = "overview" | "staff" | "payroll";

export function AgentViewClient({ data }: { data: AgentView }) {
  const [tab, setTab] = useState<Tab>("overview");

  const { agent } = data;
  const memberSince = new Date(agent.createdAt).toLocaleDateString("en-MY", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-hover rounded-md transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-[1.4rem] font-bold text-on-surface tracking-tight font-(family-name:--font-manrope)">
            {agent.name}
          </h1>
          <p className="text-[0.82rem] text-on-surface-variant">
            {agent.email} &middot; Member since {memberSince}
            {agent.companyRegistrationNo && ` \u00b7 Reg: ${agent.companyRegistrationNo}`}
          </p>
        </div>
        <span className={`px-3 py-1 text-[0.75rem] font-medium rounded-md ${
          agent.isApproved
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
        }`}>
          {agent.isApproved ? "Approved" : "Pending"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant/20">
        {([
          { key: "overview", label: "Overview", icon: Building2 },
          { key: "staff", label: `Staff (${data.dispatchers.length})`, icon: Users },
          { key: "payroll", label: `Payroll (${data.payroll.length})`, icon: FileText },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[0.82rem] font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? "text-brand border-brand"
                : "text-on-surface-variant border-transparent hover:text-on-surface hover:border-outline-variant/40"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "staff" && <StaffTab dispatchers={data.dispatchers} />}
      {tab === "payroll" && <PayrollTab payroll={data.payroll} />}
    </div>
  );
}

/* ─── Overview Tab ──────────────────────────────────────── */

function OverviewTab({ data }: { data: AgentView }) {
  const { summary, branches } = data;
  const totalDeductions = summary.totalPenalty + summary.totalAdvance;

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Net Salary", value: summary.totalNetSalary, highlight: true },
          { label: "Base Salary", value: summary.totalBaseSalary },
          { label: "Incentive", value: summary.totalIncentive },
          { label: "Petrol Subsidy", value: summary.totalPetrol },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`rounded-lg p-4 ${
              highlight
                ? "bg-linear-to-br from-brand to-brand/80 text-white"
                : "bg-surface-card border border-outline-variant/15"
            }`}
          >
            <p className={`text-[0.68rem] font-medium uppercase tracking-wider ${highlight ? "text-white/70" : "text-on-surface-variant"}`}>
              {label}
            </p>
            <p className={`text-[1.3rem] font-bold tabular-nums mt-1 ${highlight ? "text-white" : "text-on-surface"}`}>
              RM {formatRM(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Deductions row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-card rounded-lg p-4 border border-outline-variant/15">
          <p className="text-[0.68rem] font-medium uppercase tracking-wider text-on-surface-variant">Deductions</p>
          <p className={`text-[1.1rem] font-bold tabular-nums mt-1 ${totalDeductions > 0 ? "text-critical" : "text-on-surface-variant/40"}`}>
            {totalDeductions > 0 ? `RM ${formatRM(totalDeductions)}` : "—"}
          </p>
        </div>
        <div className="bg-surface-card rounded-lg p-4 border border-outline-variant/15">
          <p className="text-[0.68rem] font-medium uppercase tracking-wider text-on-surface-variant">Salary Records</p>
          <p className="text-[1.1rem] font-bold tabular-nums mt-1 text-on-surface">{summary.recordCount.toLocaleString()}</p>
        </div>
        <div className="bg-surface-card rounded-lg p-4 border border-outline-variant/15">
          <p className="text-[0.68rem] font-medium uppercase tracking-wider text-on-surface-variant">Max Branches</p>
          <p className="text-[1.1rem] font-bold tabular-nums mt-1 text-on-surface">{data.agent.maxBranches}</p>
        </div>
      </div>

      {/* Branches */}
      <div>
        <h3 className="text-[0.85rem] font-semibold text-on-surface mb-3">Branches ({branches.length})</h3>
        <div className="grid grid-cols-2 gap-2">
          {branches.map((b) => (
            <div key={b.id} className="bg-surface-card rounded-lg p-3 border border-outline-variant/15 flex items-center gap-3">
              <span className="text-[0.85rem] font-semibold text-on-surface">{b.code}</span>
              <span className="text-[0.75rem] text-on-surface-variant">{b.dispatcherCount} dispatchers</span>
              <span className="text-[0.75rem] text-on-surface-variant">{b.uploadCount} uploads</span>
            </div>
          ))}
        </div>
      </div>

      {/* Company details */}
      {(data.agent.companyAddress || data.agent.stampImageUrl) && (
        <div>
          <h3 className="text-[0.85rem] font-semibold text-on-surface mb-3">Company Details</h3>
          <div className="bg-surface-card rounded-lg p-4 border border-outline-variant/15 flex items-start gap-6">
            {data.agent.companyAddress && (
              <div className="flex-1">
                <p className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider mb-1">Address</p>
                <p className="text-[0.82rem] text-on-surface whitespace-pre-line">{data.agent.companyAddress}</p>
              </div>
            )}
            {data.agent.stampImageUrl && (
              <div>
                <p className="text-[0.68rem] font-medium text-on-surface-variant uppercase tracking-wider mb-1">Stamp</p>
                <Image
                  src={data.agent.stampImageUrl}
                  alt="Company stamp"
                  width={64}
                  height={64}
                  className="w-16 h-16 object-contain rounded border border-outline-variant/20"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Staff Tab ─────────────────────────────────────────── */

function StaffTab({ dispatchers }: { dispatchers: AgentView["dispatchers"] }) {
  const [search, setSearch] = useState("");

  const filtered = dispatchers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.extId.toLowerCase().includes(q) || d.branchCode.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        placeholder="Search by name, ID, or branch..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="px-3 py-1.5 text-[0.82rem] bg-surface-card border border-outline-variant/20 rounded-md text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-brand/40 w-72"
      />

      <div className="bg-surface-card rounded-lg border border-outline-variant/15 overflow-hidden">
        <table className="w-full text-[0.82rem]">
          <thead>
            <tr className="text-left text-[0.68rem] uppercase tracking-wider text-on-surface-variant bg-surface-container-low">
              <th className="py-2.5 px-4 font-medium">Name</th>
              <th className="py-2.5 px-3 font-medium">ID</th>
              <th className="py-2.5 px-3 font-medium">Branch</th>
              <th className="py-2.5 px-3 font-medium">IC</th>
              <th className="py-2.5 px-3 font-medium text-center">Gender</th>
              <th className="py-2.5 px-3 font-medium text-right">Records</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id} className="border-t border-outline-variant/8 hover:bg-surface-container-high/50 transition-colors">
                <td className="py-2 px-4 font-medium text-on-surface">{d.name}</td>
                <td className="py-2 px-3 text-on-surface-variant">{d.extId}</td>
                <td className="py-2 px-3">
                  <span className="px-2 py-0.5 text-[0.72rem] font-medium text-on-surface-variant bg-surface-low rounded">
                    {d.branchCode}
                  </span>
                </td>
                <td className="py-2 px-3 text-on-surface-variant tabular-nums">{d.icNo || "—"}</td>
                <td className="py-2 px-3 text-center text-on-surface-variant">
                  {d.gender === "MALE" ? "M" : d.gender === "FEMALE" ? "F" : "—"}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-on-surface-variant">
                  {d.salaryRecordCount}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-on-surface-variant/60">
                  No dispatchers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[0.72rem] text-on-surface-variant/50">
        Showing {filtered.length} of {dispatchers.length} dispatchers
      </p>
    </div>
  );
}

/* ─── Payroll Tab ───────────────────────────────────────── */

function PayrollTab({ payroll }: { payroll: AgentView["payroll"] }) {
  return (
    <div className="flex flex-col gap-4">
      {payroll.length === 0 ? (
        <p className="text-[0.85rem] text-on-surface-variant/60 text-center py-8">
          No payroll records yet.
        </p>
      ) : (
        <div className="bg-surface-card rounded-lg border border-outline-variant/15 overflow-hidden">
          <table className="w-full text-[0.82rem]">
            <thead>
              <tr className="text-left text-[0.68rem] uppercase tracking-wider text-on-surface-variant bg-surface-container-low">
                <th className="py-2.5 px-4 font-medium">Month</th>
                <th className="py-2.5 px-3 font-medium">Branch</th>
                <th className="py-2.5 px-3 font-medium text-center">Staff</th>
                <th className="py-2.5 px-3 font-medium text-right">Total Net Payout</th>
                <th className="py-2.5 px-3 font-medium text-right" />
              </tr>
            </thead>
            <tbody>
              {payroll.map((p) => (
                <tr key={p.uploadId} className="border-t border-outline-variant/8 hover:bg-surface-container-high/50 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-on-surface">
                    {MONTH_ABBR[p.month - 1]} {p.year}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 text-[0.72rem] font-medium text-on-surface-variant bg-surface-low rounded">
                      {p.branchCode}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-on-surface-variant">
                    {p.dispatcherCount}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-brand">
                    RM {formatRM(p.totalNetPayout)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Link
                      href={`/payroll/${p.uploadId}`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[0.72rem] font-medium text-brand hover:bg-brand/5 rounded transition-colors"
                    >
                      <Eye size={12} />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[0.72rem] text-on-surface-variant/50">
        {payroll.length} payroll record{payroll.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
