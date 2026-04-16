"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Bell, Upload, BadgeDollarSign, UserPlus, RefreshCw } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";

type Notification = {
  id: string;
  type: "upload" | "payroll" | "new_dispatcher" | "recalculate";
  message: string;
  detail: string;
  isRead: boolean;
  createdAt: string;
};

const iconMap = {
  upload: { Icon: Upload, bg: "#0056D2" },
  payroll: { Icon: BadgeDollarSign, bg: "#16a34a" },
  new_dispatcher: { Icon: UserPlus, bg: "#ca8a04" },
  recalculate: { Icon: RefreshCw, bg: "#7c3aed" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}D AGO`;
  if (hours > 0) return `${hours}H AGO`;
  if (mins > 0) return `${mins} MINS AGO`;
  return "JUST NOW";
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        setLoaded(true);
      }
    } catch {
      // Silent
    }
  }, []);

  // Fetch when dropdown is opened
  useEffect(() => {
    if (open) {
      fetchNotifications();
      // Mark all as read
      if (unreadCount > 0) {
        fetch("/api/notifications", { method: "PATCH" }).then(() => {
          setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        });
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(async () => {
    await fetch("/api/notifications", { method: "DELETE" });
    setItems([]);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors"
      >
        <Bell size={18} className="text-on-surface-variant" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-3.5 h-3.5 rounded-full bg-critical flex items-center justify-center text-[0.55rem] font-bold text-white px-0.5">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-[0.75rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-[rgba(195,198,214,0.18)] z-50 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-heading font-semibold text-[1rem] text-on-surface leading-tight">
                Notifications
              </h3>
              <p className="text-[0.78rem] text-on-surface-variant mt-0.5">Recent activity</p>
            </div>
            {items.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[0.78rem] font-medium text-on-surface-variant hover:text-on-surface transition-colors mt-0.5"
              >
                Clear All
              </button>
            )}
          </div>

          {!loaded ? (
            <p className="text-[0.84rem] text-on-surface-variant py-2 text-center">
              Loading...
            </p>
          ) : items.length === 0 ? (
            <p className="text-[0.84rem] text-on-surface-variant py-2 text-center">
              No notifications.
            </p>
          ) : (
            <div className="flex flex-col gap-3.5 max-h-80 overflow-y-auto">
              {items.map((n) => {
                const mapping = iconMap[n.type as keyof typeof iconMap] ?? iconMap.upload;
                const { Icon, bg } = mapping;
                return (
                  <div key={n.id} className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: bg }}
                    >
                      <Icon size={14} color="#ffffff" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.84rem] font-semibold text-on-surface leading-snug">
                        {n.message}
                      </p>
                      <p className="text-[0.75rem] text-on-surface-variant mt-0.5">{n.detail}</p>
                    </div>
                    <span className="text-[0.68rem] font-medium tracking-[0.03em] text-on-surface-variant shrink-0 mt-0.5 whitespace-nowrap">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
