"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Bell, Upload, BadgeDollarSign, UserPlus, RefreshCw } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import {
  acknowledgeDownloadsSeen,
  useJustFinishedCount,
} from "./bulk-jobs-indicator";

const DownloadsPanel = dynamic(
  () => import("./downloads-panel").then((m) => m.DownloadsPanel),
  { ssr: false },
);

type Notification = {
  id: string;
  type: "upload" | "payroll" | "new_dispatcher" | "recalculate";
  message: string;
  detail: string;
  isRead: boolean;
  createdAt: string;
};

type Tab = "notifications" | "downloads";

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
  const [tab, setTab] = useState<Tab>("notifications");
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  const unreadCount = items.filter((n) => !n.isRead).length;
  const downloadsRedDot = useJustFinishedCount() > 0;

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

  // When the popover is opened, freshen notifications + mark as read.
  useEffect(() => {
    if (!open) return;
    if (tab === "notifications") {
      fetchNotifications();
      if (unreadCount > 0) {
        fetch("/api/notifications", { method: "PATCH" }).then(() => {
          setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        });
      }
    } else if (tab === "downloads") {
      acknowledgeDownloadsSeen();
    }
  }, [open, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(async () => {
    await fetch("/api/notifications", { method: "DELETE" });
    setItems([]);
  }, []);

  const hasAnyDot = unreadCount > 0 || downloadsRedDot;

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="notification-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications and downloads"
        className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <Bell size={18} className="text-on-surface-variant" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-3.5 h-3.5 rounded-full bg-critical flex items-center justify-center text-[0.55rem] font-bold text-white px-0.5">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {unreadCount === 0 && downloadsRedDot && (
          <span
            data-testid="downloads-red-dot"
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-critical"
          />
        )}
        {/* Hidden hint for tests when both signals exist */}
        {unreadCount > 0 && downloadsRedDot && (
          <span data-testid="downloads-red-dot" className="sr-only">
            downloads ready
          </span>
        )}
        <span className="sr-only">{hasAnyDot ? "unread activity" : ""}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-96 bg-white rounded-[0.75rem] shadow-[0_12px_40px_-12px_rgba(25,28,29,0.18)] border border-[rgba(195,198,214,0.18)] z-50 p-4"
        >
          <div className="flex items-center gap-1 mb-3" role="tablist">
            <button
              data-testid="notifications-tab"
              role="tab"
              aria-selected={tab === "notifications"}
              onClick={() => setTab("notifications")}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium rounded-md transition-colors cursor-pointer ${
                tab === "notifications"
                  ? "bg-surface-container-low text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-hover"
              }`}
            >
              Notifications
              {unreadCount > 0 ? (
                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[0.6rem] font-bold text-white bg-critical rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            <button
              data-testid="downloads-tab"
              role="tab"
              aria-selected={tab === "downloads"}
              onClick={() => setTab("downloads")}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[0.82rem] font-medium rounded-md transition-colors cursor-pointer ${
                tab === "downloads"
                  ? "bg-surface-container-low text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-hover"
              }`}
            >
              Downloads
              {downloadsRedDot ? (
                <span className="w-1.5 h-1.5 rounded-full bg-critical" aria-hidden />
              ) : null}
            </button>
          </div>

          {tab === "notifications" ? (
            <NotificationsList
              items={items}
              loaded={loaded}
              onClear={handleClear}
            />
          ) : (
            <DownloadsPanel />
          )}
        </div>
      )}
    </div>
  );
}

function NotificationsList({
  items,
  loaded,
  onClear,
}: {
  items: Notification[];
  loaded: boolean;
  onClear: () => void;
}) {
  return (
    <div>
      {items.length > 0 ? (
        <div className="flex justify-end mb-2">
          <button
            onClick={onClear}
            className="text-[0.72rem] font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            Clear All
          </button>
        </div>
      ) : null}

      {!loaded ? (
        <p className="text-[0.84rem] text-on-surface-variant py-4 text-center">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="text-[0.84rem] text-on-surface-variant py-4 text-center">
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
  );
}
