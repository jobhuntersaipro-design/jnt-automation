import Link from "next/link";
import { Badge } from "@/components/arc/badge/badge";
import { getI18n } from "@/lib/i18n/server";
import type { BranchStat } from "@/lib/v2/payroll/branch-stats";
import ui from "../ui.module.css";
import styles from "./branch-cards.module.css";

const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, (part / whole) * 100) : 0);

/** The sidebar month, branch by branch: pay, what it's made of, what came off, and against last month. */
export async function BranchCards({ stats, month }: { stats: BranchStat[]; month: string }) {
  const i18n = await getI18n();
  const { t, tp } = i18n;
  const rm = (cents: number) => i18n.money(cents / 100);
  return (
    <section className={ui.stack} aria-labelledby="branches-title">
      <h2 id="branches-title" className={ui.cardTitle}>
        {t("dashboard.byBranch", { month })}
      </h2>
      <div className={styles.grid}>
        {stats.map((s) => {
          const earned = s.rateCents + s.kpiCents + s.bonusCents + s.otherCents;
          const change = s.prevNetCents ? ((s.netCents - s.prevNetCents) / Math.abs(s.prevNetCents)) * 100 : null;
          const parts = [
            { key: "rate", cents: s.rateCents, label: t("journal.slot.PARCEL"), className: styles.rate },
            { key: "kpi", cents: s.kpiCents, label: t("journal.slot.KPI"), className: styles.kpi },
            { key: "bonus", cents: s.bonusCents, label: t("journal.slot.SUCCESS"), className: styles.bonus },
            { key: "other", cents: s.otherCents, label: t("dashboard.branch.other"), className: styles.other },
          ].filter((p) => p.cents > 0);
          return (
            <article key={s.runId} className={ui.card}>
              <header className={styles.head}>
                <Link href={`/app/payroll/${s.runId}`} className={styles.code}>
                  {s.branch}
                </Link>
                <Badge tone={s.status === "FINAL" ? "success" : "neutral"} size="sm">
                  {t(s.status === "FINAL" ? "close.status.final" : "close.status.draft")}
                </Badge>
              </header>
              <div>
                <p className={styles.net}>{rm(s.netCents)}</p>
                <p className={ui.help}>
                  {change === null
                    ? t("dashboard.branch.noPrev")
                    : t(change >= 0 ? "dashboard.branch.up" : "dashboard.branch.down", { pct: i18n.number(Math.round(Math.abs(change) * 10) / 10) })}
                </p>
              </div>
              {earned > 0 && (
                <div className={styles.split}>
                  <div className={styles.bar} aria-hidden="true">
                    {parts.map((p) => (
                      <span key={p.key} className={p.className} style={{ width: `${pct(p.cents, earned)}%` }} />
                    ))}
                  </div>
                  <ul className={styles.legend}>
                    {parts.map((p) => (
                      <li key={p.key}>
                        <span className={`${styles.dot} ${p.className}`} aria-hidden="true" />
                        {t("dashboard.branch.part", { label: p.label, amount: rm(p.cents), pct: i18n.number(Math.round(pct(p.cents, earned))) })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className={styles.facts}>
                <div>
                  <dt>{t("dashboard.branch.riders")}</dt>
                  <dd>{t("dashboard.branch.paidOf", { paid: s.paid, riders: s.riders })}</dd>
                </div>
                <div>
                  <dt>{t("dashboard.parcels")}</dt>
                  <dd>{i18n.number(s.parcels)}</dd>
                </div>
                <div>
                  <dt>{t("dashboard.branch.avgParcels")}</dt>
                  <dd>{s.riders ? i18n.number(Math.round(s.parcels / s.riders)) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("dashboard.branch.avgNet")}</dt>
                  <dd>{s.riders ? rm(Math.round(s.netCents / s.riders)) : "—"}</dd>
                </div>
                <div>
                  <dt>{t("journal.slot.PENALTY")}</dt>
                  <dd>{t("dashboard.branch.penalties", { amount: rm(s.penaltyCents), cases: s.penaltyCases })}</dd>
                </div>
                <div>
                  <dt>{t("journal.slot.ADVANCE")}</dt>
                  <dd>{rm(s.advanceCents)}</dd>
                </div>
                {s.top && (
                  <div className={styles.wide}>
                    <dt>{t("dashboard.branch.top")}</dt>
                    <dd>{`${s.top.name} · ${rm(s.top.netCents)}`}</dd>
                  </div>
                )}
              </dl>
              {s.belowZero > 0 && <p className={styles.warn}>{tp("dashboard.branch.belowZero", s.belowZero)}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
