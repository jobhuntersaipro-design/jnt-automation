import { mockNotifications } from "@/lib/mock-data";
import { Upload, DollarSign, UserPlus } from "lucide-react";

const iconMap = {
  upload: { Icon: Upload, bg: "#eef3fb", color: "#0056D2" },
  payroll: { Icon: DollarSign, bg: "#fef3f3", color: "#940002" },
  new_dispatcher: { Icon: UserPlus, bg: "#f3f8ee", color: "#3a7d1e" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return "just now";
}

export function Notifications() {
  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-(family-name:--font-manrope) font-semibold text-[1rem] text-on-surface">
            System Notifications
          </h2>
          <p className="text-[0.75rem] text-on-surface-variant mt-0.5">Recent activity</p>
        </div>
        <button className="text-[0.75rem] text-brand font-medium hover:underline">
          Clear All
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {mockNotifications.map((n) => {
          const { Icon, bg, color } = iconMap[n.type];
          return (
            <div
              key={n.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-low transition-colors"
            >
              <div
                className="w-8 h-8 rounded-[0.375rem] flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: bg }}
              >
                <Icon size={15} style={{ color }} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.8125rem] font-medium text-on-surface">{n.message}</p>
                <p className="text-[0.7rem] text-on-surface-variant mt-0.5">{n.detail}</p>
              </div>
              <span className="text-[0.7rem] text-on-surface-variant/70 shrink-0 mt-0.5">
                {timeAgo(n.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
