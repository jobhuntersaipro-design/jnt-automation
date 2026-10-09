"use client";

import { useI18n } from "@/components/v2/i18n-provider";
import type { Employment } from "@/lib/v2/pay/config";
import type { AuditView } from "@/lib/v2/rules/data";
import { monthLabel, scopeLabel } from "../labels";
import ui from "../ui.module.css";

/** Who changed this rule, what and when, in the viewer's language. */
export function History({ audit }: { audit: AuditView[] }) {
  const i18n = useI18n();
  const { t } = i18n;

  function describe(a: AuditView): string {
    const d = a.detail;
    const month = typeof d.month === "number" ? monthLabel(i18n, d.month) : "";
    const who = scopeLabel(i18n, {
      branchCode: typeof d.outlet === "string" ? d.outlet : null,
      dispatcherName: typeof d.dispatcher === "string" ? d.dispatcher : null,
      employment: d.employment === "FULL_TIME" || d.employment === "PART_TIME" ? (d.employment as Employment) : null,
    });
    const file = typeof d.source === "string" && d.source.startsWith("import:") ? d.source.slice("import:".length) : null;
    const source = file ? t("history.fromFile", { file }) : "";
    switch (a.action) {
      case "create":
        return t("history.create", { month });
      case "version":
        return t("history.version", { month }) + source;
      case "replace":
        return t("history.replace", { month }) + source;
      case "deleteVersion":
        return t("history.deleteVersion", { month });
      case "rename":
        return t("history.rename", { from: String(d.from ?? ""), to: String(d.to ?? "") });
      case "archive":
        return t("history.archive");
      case "copy":
        return t("history.copy", { from: String(d.from ?? "") });
      case "assign":
        return t("history.assign", { who, month });
      case "cover":
        return t("history.cover", { month, outlet: String(d.outlet ?? "") });
      case "unassign":
        return t("history.unassign", { who, month });
      default:
        return a.action;
    }
  }

  return (
    <section className={ui.card} aria-labelledby="history-title">
      <h2 id="history-title" className={ui.cardTitle}>
        {t("history.title")}
      </h2>
      {audit.length === 0 ? (
        <p className={ui.muted}>{t("history.empty")}</p>
      ) : (
        <ul className={ui.list}>
          {audit.map((a) => (
            <li key={a.id}>
              <span>{describe(a)}</span>
              <span className={ui.help}>
                {t("history.by", {
                  actor: a.actor ?? "—",
                  when: i18n.date(new Date(a.createdAt), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
