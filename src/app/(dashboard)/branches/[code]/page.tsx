import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Truck, ShieldCheck, ClipboardList, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getBranchDetail } from "@/lib/db/branches";
import { getBranchColor } from "@/lib/branch-colors";
import { BranchTrendChart } from "@/components/branches/branch-trend-chart";
import { AddEmployeeButton } from "@/components/branches/add-employee-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatRM(value: number): string {
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRMShort(value: number): string {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}K`;
  return formatRM(value);
}

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);

  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");

  const [detail, allBranches] = await Promise.all([
    getBranchDetail(effective.agentId, code),
    prisma.branch.findMany({
      where: { agentId: effective.agentId },
      select: { code: true },
      orderBy: { code: "asc" },
    }),
  ]);
  if (!detail) notFound();

  const { summary, trend, dispatchers, employees } = detail;
  const branchColor = getBranchColor(summary.branchCode);
  const branchCodes = allBranches.map((b) => b.code);

  const supervisorCount = employees.filter((e) => e.type === "SUPERVISOR").length;
  const adminCount = employees.filter((e) => e.type === "ADMIN").length;
  const storeKeeperCount = employees.filter((e) => e.type === "STORE_KEEPER").length;

  const peopleCards: PeopleCard[] = [
    {
      label: "Dispatchers",
      count: summary.dispatcherCount,
      icon: Truck,
      tileBg: "bg-brand/10",
      tileFg: "text-brand",
      countColor: "text-brand",
      target: "#dispatchers-section",
    },
    {
      label: "Supervisors",
      count: supervisorCount,
      icon: ShieldCheck,
      tileBg: "bg-emerald-50",
      tileFg: "text-emerald-700",
      countColor: "text-emerald-700",
      target: "#employees-section",
    },
    {
      label: "Admins",
      count: adminCount,
      icon: ClipboardList,
      tileBg: "bg-purple-50",
      tileFg: "text-purple-700",
      countColor: "text-purple-700",
      target: "#employees-section",
    },
    {
      label: "Store keepers",
      count: storeKeeperCount,
      icon: Package,
      tileBg: "bg-amber-50",
      tileFg: "text-amber-700",
      countColor: "text-amber-700",
      target: "#employees-section",
    },
  ];

  const summaryCards = [
    { label: "Net payout", value: formatRMShort(summary.totals.netSalary), accent: "text-brand" },
    { label: "Base salary", value: formatRMShort(summary.totals.baseSalary), accent: "text-on-surface" },
    { label: "Bonus tier", value: formatRMShort(summary.totals.bonusTier), accent: "text-emerald-700" },
    { label: "Petrol subsidy", value: formatRMShort(summary.totals.petrolSubsidy), accent: "text-amber-700" },
    { label: "Penalty", value: formatRMShort(summary.totals.penalty), accent: "text-critical" },
    { label: "Advance", value: formatRMShort(summary.totals.advance), accent: "text-critical" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-5 pb-3 lg:pb-4 bg-surface/80 backdrop-blur-md">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[0.78rem] text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Overview
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center font-semibold tabular-nums rounded-md ring-1 ring-inset px-2.5 py-1 text-[1rem] ${branchColor.bg} ${branchColor.text} ${branchColor.ring}`}
            >
              {summary.branchCode}
            </span>
            <h1 className="font-heading font-bold text-[1.2rem] lg:text-[1.36rem] text-on-surface tracking-tight">
              Branch overview
            </h1>
          </div>
          <AddEmployeeButton branchCode={summary.branchCode} branchCodes={branchCodes} />
        </div>
        <p className="text-[0.78rem] text-on-surface-variant mt-1">
          {summary.monthCount} month{summary.monthCount === 1 ? "" : "s"} of salary records ·{" "}
          {summary.totals.totalOrders.toLocaleString()} lifetime orders
        </p>
      </header>

      <main className="px-4 lg:px-8 pb-12 space-y-6">
        {/* People at branch — role count cards (Dispatchers / Supervisors / Admins / Store keepers) */}
        <section
          aria-label="People at branch"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {peopleCards.map((c) => (
            <PeopleCountCard key={c.label} card={c} />
          ))}
        </section>

        {/* Summary cards */}
        <section
          aria-label="Branch totals"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          {summaryCards.map((c) => (
            <div
              key={c.label}
              className="bg-white rounded-[0.75rem] p-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant"
            >
              <p className="text-[0.65rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
                {c.label}
              </p>
              <p className={`mt-1.5 text-[1.05rem] font-semibold tabular-nums ${c.accent}`}>
                {c.value}
              </p>
            </div>
          ))}
        </section>

        {/* Monthly trend */}
        <section aria-label="Monthly trend">
          <BranchTrendChart trend={trend} />
        </section>

        {/* Dispatchers list */}
        <section
          id="dispatchers-section"
          aria-label="Dispatchers at this branch"
          className="scroll-mt-24 lg:scroll-mt-28 bg-white rounded-[0.75rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap">
            <div>
              <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">
                Dispatchers
              </h2>
              <p className="text-[0.78rem] text-on-surface-variant mt-0.5">
                Sorted by lifetime net salary at this branch
              </p>
            </div>
            <Link
              href="/dispatchers"
              className="text-[0.78rem] font-medium text-brand hover:underline"
            >
              View all dispatchers →
            </Link>
          </header>

          {dispatchers.length === 0 ? (
            <p className="px-6 pb-6 text-[0.85rem] text-on-surface-variant">
              No dispatchers assigned to this branch yet.
            </p>
          ) : (
            <div className="border-t border-outline-variant/15">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-[2fr_1.2fr_0.7fr_0.7fr_1fr_1fr_0.6fr] gap-x-3 px-6 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-on-surface-variant/60 bg-surface-low/50">
                <span>Dispatcher</span>
                <span>Assignment ID</span>
                <span className="text-right">Months</span>
                <span className="text-right">Orders</span>
                <span className="text-right">Net salary</span>
                <span className="text-right">Last active</span>
                <span className="text-right">Status</span>
              </div>

              <ul>
                {dispatchers.map((d) => (
                  <li
                    key={d.dispatcherId}
                    className="grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_0.7fr_0.7fr_1fr_1fr_0.6fr] gap-x-3 gap-y-1 items-center px-6 py-3 border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-hover/40 transition-colors"
                  >
                    <Link
                      href={`/dispatchers?highlight=${encodeURIComponent(d.extId)}`}
                      className="text-[0.9rem] font-medium text-on-surface hover:text-brand truncate"
                    >
                      {d.name}
                    </Link>
                    <span className="text-[0.78rem] text-on-surface-variant tabular-nums truncate">
                      {d.extId}
                    </span>
                    <span className="text-[0.82rem] text-on-surface-variant tabular-nums text-right">
                      {d.monthsActive}
                    </span>
                    <span className="text-[0.82rem] text-on-surface-variant tabular-nums text-right">
                      {d.totalOrders.toLocaleString()}
                    </span>
                    <span className="text-[0.9rem] font-semibold text-brand tabular-nums text-right">
                      {formatRM(d.totalNetSalary)}
                    </span>
                    <span className="text-[0.78rem] text-on-surface-variant tabular-nums text-right">
                      {d.lastActive ?? "—"}
                    </span>
                    <span className="text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[0.65rem] font-medium rounded-full ring-1 ring-inset ${
                          d.isCurrentlyAssigned
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-surface-low text-on-surface-variant ring-outline-variant/30"
                        }`}
                      >
                        {d.isCurrentlyAssigned ? "Current" : "Past"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Employees at this branch — appears after Add Employee so new rows land visibly here */}
        <section
          id="employees-section"
          aria-label="Employees at this branch"
          className="scroll-mt-24 lg:scroll-mt-28 bg-white rounded-[0.75rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-6 py-4 flex-wrap">
            <div>
              <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">
                Employees
              </h2>
              <p className="text-[0.78rem] text-on-surface-variant mt-0.5">
                Supervisors, admins, and store keepers at this branch
              </p>
            </div>
            <Link
              href="/staff"
              className="text-[0.78rem] font-medium text-brand hover:underline"
            >
              Manage all employees →
            </Link>
          </header>
          {employees.length === 0 ? (
            <p className="px-6 pb-6 text-[0.85rem] text-on-surface-variant">
              No employees at this branch yet. Use the <span className="font-medium">Add employee</span> button above.
            </p>
          ) : (
            <div className="border-t border-outline-variant/15">
              <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1.2fr_0.6fr] gap-x-3 px-6 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-on-surface-variant/60 bg-surface-low/50">
                <span>Name</span>
                <span>Position</span>
                <span>Employee ID</span>
                <span>IC Number</span>
                <span className="text-right">Status</span>
              </div>
              <ul>
                {employees.map((e) => (
                  <li
                    key={e.employeeId}
                    className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.2fr_0.6fr] gap-x-3 gap-y-1 items-center px-6 py-3 border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-hover/40 transition-colors"
                  >
                    <Link
                      href={`/staff?highlight=${encodeURIComponent(e.employeeId)}`}
                      className="text-[0.9rem] font-medium text-on-surface hover:text-brand truncate"
                    >
                      {e.name}
                    </Link>
                    <span className="text-[0.78rem] text-on-surface-variant">
                      {e.type === "STORE_KEEPER" ? "Store Keeper" : e.type === "SUPERVISOR" ? "Supervisor" : "Admin"}
                    </span>
                    <span className="text-[0.78rem] text-on-surface-variant tabular-nums truncate">
                      {e.extId ?? "—"}
                    </span>
                    <span className="text-[0.78rem] text-on-surface-variant tabular-nums">
                      {e.icNo || "—"}
                    </span>
                    <span className="text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[0.65rem] font-medium rounded-full ring-1 ring-inset ${
                          e.isComplete
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                      >
                        {e.isComplete ? "Complete" : "Missing IC"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

type PeopleCard = {
  label: string;
  count: number;
  icon: LucideIcon;
  tileBg: string;
  tileFg: string;
  countColor: string;
  target: string;
};

function PeopleCountCard({ card }: { card: PeopleCard }) {
  const Icon = card.icon;
  const empty = card.count === 0;
  return (
    <a
      href={card.target}
      aria-label={`Jump to ${card.label} at this branch (${card.count})`}
      className="group block bg-white rounded-[0.75rem] p-4 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant cursor-pointer hover:shadow-[0_12px_40px_-12px_rgba(25,28,29,0.12)] transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${card.tileBg} ${card.tileFg}`}
          aria-hidden
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <p className="text-[0.65rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          {card.label}
        </p>
      </div>
      <p
        className={`mt-1.5 text-[1.05rem] font-semibold tabular-nums ${
          empty ? "text-on-surface-variant/40" : card.countColor
        }`}
      >
        {card.count}
      </p>
    </a>
  );
}
