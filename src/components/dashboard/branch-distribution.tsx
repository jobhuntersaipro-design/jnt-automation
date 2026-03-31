import { mockBranches } from "@/lib/mock-data";

function fmt(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  return `RM ${(n / 1_000_000).toFixed(2)}M`;
}

export function BranchDistribution() {
  const max = Math.max(...mockBranches.map((b) => b.netPayout));

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.08)] border-l-4 border-critical h-full">
      <div>
        <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
          Branch Distribution
        </h2>
        <p className="text-[0.9rem] text-on-surface-variant mt-0.5">Net payout by branch</p>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        {mockBranches.map((branch) => {
          const pct = Math.round((branch.netPayout / max) * 100);
          return (
            <div key={branch.name} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.975rem] font-medium text-on-surface">{branch.name}</span>
                <span className="text-[0.975rem] tabular-nums text-brand font-semibold">
                  RM {fmt(branch.netPayout)}
                </span>
              </div>
              <div className="relative group">
                <div className="h-1.5 bg-surface-low rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-on-surface text-white text-[0.78rem] font-medium px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  {branch.name} · {fmtShort(branch.netPayout)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-1 border-t border-outline-variant/15">
        <button className="text-[0.9rem] font-semibold tracking-widest text-brand hover:opacity-70 transition-opacity">
          VIEW COMPREHENSIVE REPORT
        </button>
      </div>
    </div>
  );
}
