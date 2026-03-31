import { mockTopDispatchers } from "@/lib/mock-data";

function fmt(value: number) {
  return value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Avatar({ name, gender }: { name: string; gender: "MALE" | "FEMALE" | "UNKNOWN" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  const ringColor =
    gender === "MALE" ? "#0056D2" : gender === "FEMALE" ? "#f472b6" : "#c3c6d6";

  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-low text-[0.75rem] font-semibold text-on-surface-variant shrink-0"
      style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
    >
      {initials}
    </div>
  );
}

export function TopDispatchers() {
  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-(family-name:--font-manrope) font-semibold text-[1rem] text-on-surface">
            Top Performing Dispatchers
          </h2>
          <p className="text-[0.75rem] text-on-surface-variant mt-0.5">By net salary this period</p>
        </div>
        <button className="text-[0.75rem] text-brand font-medium hover:underline">
          View All Staff
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {mockTopDispatchers.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-low transition-colors"
          >
            <Avatar name={d.name} gender={d.gender} />
            <div className="flex-1 min-w-0">
              <p className="text-[0.8125rem] font-medium text-on-surface truncate">{d.name}</p>
              <p className="text-[0.7rem] text-on-surface-variant">
                {d.branch} · {d.totalOrders.toLocaleString()} deliveries
              </p>
            </div>
            <span className="tabular-nums text-[0.875rem] font-semibold text-brand shrink-0">
              RM {fmt(d.netSalary)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
