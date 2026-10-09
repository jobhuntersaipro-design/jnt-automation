"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import type { Period } from "@/lib/v2/pay/resolve";
import { finaliseMonth } from "@/lib/v2/payroll/actions";
import type { CloseRow, CloseStatus } from "@/lib/v2/payroll/month";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

const TONE: Record<CloseStatus, BadgeTone> = { none: "warning", draft: "neutral", ready: "info", final: "success" };

/** Every branch's payroll for the sidebar's month: what's in, what's missing, what's ready, what's done. */
export function MonthClose({ period, outlet, rows, owner = true }: { period: Period; outlet: string | null; rows: CloseRow[]; owner?: boolean }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const month = monthLabel(i18n, period);
  const ready = rows.filter((r) => r.status === "ready");
  const finals = rows.filter((r) => r.status === "final").length;
  const start = (
    <Button onClick={() => router.push("/app/payroll/new")}>
      <FileUp size={16} aria-hidden="true" />
      {t("wizard.start")}
    </Button>
  );

  return (
    <>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("close.title", { month })}</h1>
          <p className={ui.subtitle}>{t("close.subtitle")}</p>
        </div>
        <div className={ui.row}>
          {owner && (
            <Link href={`/app/payroll/check?month=${period}`} className={ui.link}>
              {t("runs.check")}
            </Link>
          )}
          {owner && finals > 0 && (
            <Link href={`/app/payroll/journal?month=${period}`} className={ui.link}>
              {t("journal.link")}
            </Link>
          )}
          {start}
        </div>
      </header>

      {rows.every((r) => !r.run) ? (
        <EmptyState title={t("close.emptyTitle", { month })} description={t("runs.emptyBody")} action={start} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t("runs.outlet")}</th>
                  <th scope="col">{t("close.col.file")}</th>
                  <th scope="col">{t("close.col.penalties")}</th>
                  <th scope="col" data-numeric>
                    {t("runs.dispatchers")}
                  </th>
                  <th scope="col" data-numeric>
                    {t("runs.net")}
                  </th>
                  <th scope="col">{t("runs.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.branch}>
                    <th scope="row">
                      {r.run ? (
                        <Link href={`/app/payroll/${r.run.id}`} className={styles.open}>
                          {r.branch}
                        </Link>
                      ) : (
                        r.branch
                      )}
                    </th>
                    <td>
                      {r.run ? (
                        <span title={r.run.fileName}>{t("close.uploaded", { date: i18n.date(new Date(r.run.uploadedAt)) })}</span>
                      ) : (
                        <span className={styles.warn}>{t("close.notUploaded")}</span>
                      )}
                    </td>
                    <td>
                      {r.penaltyCases === 0 ? (
                        <span className={styles.warn}>{t("close.noPenalties")}</span>
                      ) : (
                        tp("close.penalties", r.penaltyCases)
                      )}
                    </td>
                    <td data-numeric>
                      {r.run ? i18n.number(r.run.dispatchers) : "—"}
                      {r.run && r.run.missingProfiles > 0 && <div className={styles.warn}>{tp("close.missing", r.run.missingProfiles)}</div>}
                    </td>
                    <td data-numeric>{r.run ? i18n.money(r.run.netCents / 100) : "—"}</td>
                    <td>
                      <span className={styles.status}>
                        <Badge tone={TONE[r.status]} size="sm">
                          {t(`close.status.${r.status}`)}
                        </Badge>
                        {r.status === "final" && r.run && (
                          <Link href={`/app/payroll/${r.run.id}/send`} className={ui.link}>
                            {t("run.send")}
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t("common.total")}</th>
                  <td />
                  <td />
                  <td data-numeric>{i18n.number(rows.reduce((n, r) => n + (r.run?.dispatchers ?? 0), 0))}</td>
                  <td data-numeric>{i18n.money(rows.reduce((n, r) => n + (r.run?.netCents ?? 0), 0) / 100)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={ui.row}>
            {owner && ready.length > 0 && (
              <ConfirmButton
                variant="primary"
                label={tp("close.finalise", ready.length)}
                prompt={t("close.finalisePrompt", { branches: ready.map((r) => r.branch).join(", ") })}
                confirmLabel={tp("close.finalise", ready.length)}
                doneLabel={t("run.finalised")}
                onConfirm={async () => {
                  const r = await finaliseMonth({ period, outlet });
                  if (!r.ok) {
                    toast.error(t(r.error, r.vars));
                    throw new Error(r.error);
                  }
                  toast.success(t("close.finalised", { branches: r.data.branches.join(", ") }));
                  router.refresh();
                }}
              />
            )}
            {finals > 0 && (
              <Button variant="secondary" onClick={() => router.push(`/app/payslips/month/${period}${outlet ? `?outlet=${outlet}` : ""}`)}>
                <FileText size={16} aria-hidden="true" />
                {t("close.payslips")}
              </Button>
            )}
          </div>
          {!owner && ready.length > 0 && <p className={ui.help}>{t("team.ownerFinalises")}</p>}
          {ready.length === 0 && finals < rows.length && <p className={ui.help}>{t("close.readyHelp")}</p>}
        </>
      )}
    </>
  );
}
