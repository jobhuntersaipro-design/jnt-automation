import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck, ShieldCheck, ClipboardList, Package, ArrowRight } from "lucide-react";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getBranchesOverview, type BranchOverviewCard } from "@/lib/db/branches";
import { getBranchColor } from "@/lib/branch-colors";

export const dynamic = "force-dynamic";

function formatRMShort(value: number): string {
  if (value >= 1_000_000) return `RM ${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `RM ${(value / 1_000).toFixed(1)}K`;
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function BranchesPage() {
  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");

  const branches = await getBranchesOverview(effective.agentId);

  const totalDispatchers = branches.reduce((s, b) => s + b.dispatcherCount, 0);
  const totalEmployees = branches.reduce(
    (s, b) => s + b.supervisorCount + b.adminCount + b.storeKeeperCount,
    0,
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 px-4 lg:px-8 pt-4 lg:pt-5 pb-3 lg:pb-4 bg-surface/80 backdrop-blur-md">
        <h1 className="font-heading font-bold text-[1.2rem] lg:text-[1.36rem] text-on-surface tracking-tight">
          Branches
        </h1>
        <p className="text-[0.78rem] text-on-surface-variant mt-0.5">
          {branches.length} branch{branches.length === 1 ? "" : "es"} · {totalDispatchers} dispatcher
          {totalDispatchers === 1 ? "" : "s"} · {totalEmployees} employee{totalEmployees === 1 ? "" : "s"}
        </p>
      </header>

      <main className="px-4 lg:px-8 pb-12">
        {branches.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {branches.map((b) => (
              <li key={b.branchCode}>
                <BranchCard branch={b} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-[0.75rem] p-10 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-on-surface-variant text-center">
      <h2 className="font-heading font-semibold text-[1.1rem] text-on-surface">
        No branches yet
      </h2>
      <p className="mt-1.5 text-[0.85rem] text-on-surface-variant">
        Branches are auto-created when you upload payroll data, or you can add one from the
        Staff page.
      </p>
      <Link
        href="/dispatchers?tab=payroll"
        className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-[0.85rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors"
      >
        Go to Payroll
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function BranchCard({ branch }: { branch: BranchOverviewCard }) {
  const c = getBranchColor(branch.branchCode);
  const totalEmployees = branch.supervisorCount + branch.adminCount + branch.storeKeeperCount;
  const totalPeople = branch.dispatcherCount + totalEmployees;

  return (
    <Link
      href={`/branches/${encodeURIComponent(branch.branchCode)}`}
      aria-label={`Open branch ${branch.branchCode} detail`}
      className="group block h-full bg-white rounded-[0.75rem] p-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.06)] border border-outline-variant/15 hover:border-outline-variant/40 hover:shadow-[0_12px_40px_-12px_rgba(25,28,29,0.12)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      {/* Top: branch chip + arrow */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <span
          className={`inline-flex items-center font-semibold tabular-nums rounded-md ring-1 ring-inset px-2 py-0.5 text-[0.85rem] ${c.bg} ${c.text} ${c.ring}`}
        >
          {branch.branchCode}
        </span>
        <ArrowRight
          size={16}
          className="text-on-surface-variant/40 group-hover:text-brand group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5"
        />
      </div>

      {/* Headline: total people */}
      <div className="mb-4">
        <p className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
          People at branch
        </p>
        <p className="mt-0.5 text-[1.5rem] font-bold tabular-nums text-on-surface leading-tight">
          {totalPeople}
        </p>
      </div>

      {/* Counts grid */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <CountRow
          icon={Truck}
          label="Dispatchers"
          value={branch.dispatcherCount}
          color="text-brand"
          bg="bg-brand/10"
        />
        <CountRow
          icon={ShieldCheck}
          label="Supervisors"
          value={branch.supervisorCount}
          color="text-emerald-700"
          bg="bg-emerald-50"
        />
        <CountRow
          icon={ClipboardList}
          label="Admins"
          value={branch.adminCount}
          color="text-purple-700"
          bg="bg-purple-50"
        />
        <CountRow
          icon={Package}
          label="Store keepers"
          value={branch.storeKeeperCount}
          color="text-amber-700"
          bg="bg-amber-50"
        />
      </ul>

      {/* Footer: lifetime net + last active */}
      <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
            Lifetime net
          </p>
          <p className="text-[0.85rem] font-semibold tabular-nums text-brand truncate">
            {branch.lifetimeNetPayout > 0 ? formatRMShort(branch.lifetimeNetPayout) : "—"}
          </p>
        </div>
        <div className="text-right min-w-0">
          <p className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium">
            Last active
          </p>
          <p className="text-[0.78rem] tabular-nums text-on-surface-variant truncate">
            {branch.lastActive ?? "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CountRow({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${bg} ${color}`}
        aria-hidden
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-[0.6rem] uppercase tracking-wider text-on-surface-variant/70 font-medium leading-tight">
          {label}
        </p>
        <p className={`text-[0.95rem] font-semibold tabular-nums leading-tight ${value > 0 ? "text-on-surface" : "text-on-surface-variant/40"}`}>
          {value}
        </p>
      </div>
    </li>
  );
}
