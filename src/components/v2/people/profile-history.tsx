"use client";

import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { useI18n } from "@/components/v2/i18n-provider";
import type { ProfileChange } from "@/lib/v2/people/data";
import { periodToInput } from "@/lib/v2/pay/resolve";
import { profileLabel } from "../labels";
import { DispatchersHeader } from "./dispatcher-list";
import ui from "../ui.module.css";

type Row = { id: string; dispatcherId: string; dispatcher: string; change: string; month: string; by: string; when: string };

/** "2026-10-09 15:02" in local time: sorts as text, reads the same in both languages. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Every vehicle-and-type change across dispatchers: who, old → new, from which month, when. */
export function ProfileHistory({ changes }: { changes: ProfileChange[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();

  const rows: Row[] = changes.map((c) => {
    const to = profileLabel(i18n, c.to);
    return {
      id: c.id,
      dispatcherId: c.dispatcherId ?? "",
      dispatcher: c.dispatcher ?? t("dispatchers.history.many", { count: c.count }),
      change:
        c.action === "profileDelete"
          ? t("dispatchers.history.removed", { profile: to })
          : c.from
            ? t("dispatchers.history.changed", { from: profileLabel(i18n, c.from), to })
            : t("dispatchers.history.set", { to }),
      month: periodToInput(c.month),
      by: c.actor ?? "",
      when: stamp(c.at),
    };
  });

  const columns: Column<Row>[] = [
    { key: "dispatcher", header: t("dispatchers.history.col.dispatcher") },
    { key: "change", header: t("dispatchers.history.col.change") },
    { key: "month", header: t("dispatchers.history.col.from") },
    { key: "by", header: t("dispatchers.history.col.by") },
    { key: "when", header: t("dispatchers.history.col.when") },
  ];

  return (
    <div className={ui.page}>
      <DispatchersHeader tab="history" />
      {rows.length === 0 ? (
        <EmptyState title={t("dispatchers.history.emptyTitle")} description={t("dispatchers.history.emptyBody")} />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowLabel={(r) => r.dispatcher}
          searchKeys={["dispatcher", "change", "month", "by"]}
          onOpen={(r) => r.dispatcherId && router.push(`/app/dispatchers/${r.dispatcherId}`)}
          exportName={t("dispatchers.history.export")}
          labels={{ search: "dispatchers.history.search", rows: "dispatchers.history.rows", empty: "dispatchers.history.noMatch" }}
        />
      )}
    </div>
  );
}
