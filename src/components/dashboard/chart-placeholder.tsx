import { mockMonthlyTrend } from "@/lib/mock-data";

function fmtShort(n: number) {
  return `RM ${(n / 1_000_000).toFixed(2)}M`;
}

export function ChartPlaceholder() {
  const max = Math.max(...mockMonthlyTrend.map((d) => d.netPayout));

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5">
      <div>
        <h2 className="font-heading font-semibold text-[1rem] text-on-surface">
          Monthly Net Payout Trend
        </h2>
        <p className="text-[0.75rem] text-on-surface-variant mt-0.5">Last 6 months</p>
      </div>

      {/* Bar chart preview */}
      <div className="flex items-end gap-3 h-36 pt-2">
        {mockMonthlyTrend.map((d, i) => {
          const barHeight = Math.round((d.netPayout / max) * 100);
          const isLast = i === mockMonthlyTrend.length - 1;
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-2 relative group">
              {/* Hover tooltip */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full -mt-1 bg-on-surface text-white text-[0.65rem] font-medium px-2 py-1 rounded-[0.25rem] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                {d.month} · {fmtShort(d.netPayout)}
              </div>
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                <div
                  className="w-full rounded-t-lg transition-all"
                  style={{
                    height: `${barHeight}%`,
                    background: isLast ? "#0056D2" : "rgba(0,86,210,0.25)",
                  }}
                />
              </div>
              <span className="text-[0.7rem] text-on-surface-variant">{d.month}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[0.7rem] text-on-surface-variant/60 text-center">
        Chart component — Phase 2
      </p>
    </div>
  );
}
