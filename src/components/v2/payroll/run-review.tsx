"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ConfirmMorph } from "@/components/arc/confirm-morph/confirm-morph";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { useI18n } from "@/components/v2/i18n-provider";
import type { I18n } from "@/lib/i18n/core";
import type { Group, Line } from "@/lib/v2/pay/engine";
import { periodToInput } from "@/lib/v2/pay/resolve";
import { deleteRun, finalise, recalculateRun } from "@/lib/v2/payroll/actions";
import type { Warning } from "@/lib/v2/payroll/calc";
import type { ResultView, RunView } from "@/lib/v2/payroll/data";
import { setProfiles } from "@/lib/v2/people/actions";
import { monthLabel, PROFILES, profileLabel, rangeLabels } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

const RM = "RM ";
const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

function warningText(i18n: I18n, w: Warning): string {
  if (w.code === "noProfile") return i18n.t("run.warn.noProfile");
  if (w.code === "noParcelRule") return i18n.t("run.warn.noParcelRule");
  return i18n.t("run.warn.noRates", { rule: w.rule, kind: i18n.t(`kind.${w.kind}`) });
}

type Row = { id: string; name: string; extId: string; profile: string; parcels: number; earnings: number; deductions: number; net: number; status: string };

/** One outlet's month: totals, every dispatcher's pay, what needs fixing, and finalising. */
export function RunReview({ run }: { run: RunView }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const month = monthLabel(i18n, run.period);
  const draft = run.status === "DRAFT";
  const flagged = run.results.filter((r) => r.warnings.length > 0).length;
  const parcels = run.results.reduce((n, r) => n + r.parcels, 0);
  const net = run.results.reduce((n, r) => n + r.netCents, 0) / 100;
  const stats = run.stats;
  const notes = stats ? (["otherOutlets", "otherMonths", "noDate"] as const).filter((k) => stats[k] > 0).map((k) => i18n.tp(`run.note.${k}`, stats[k])) : [];

  const rows: Row[] = run.results.map((r) => ({
    id: r.id,
    name: r.name,
    extId: r.extId,
    profile: r.profile ? profileLabel(i18n, r.profile) : t("profile.notSet"),
    parcels: r.parcels,
    earnings: r.earningsCents / 100,
    deductions: r.deductionCents / 100,
    net: r.netCents / 100,
    status: r.warnings.length ? r.warnings.map((w) => warningText(i18n, w)).join("; ") : t("run.ok"),
  }));
  const columns: Column<Row>[] = [
    { key: "name", header: t("run.col.name") },
    { key: "extId", header: t("run.col.id") },
    { key: "profile", header: t("run.col.profile") },
    { key: "parcels", header: t("run.col.parcels"), format: "number", total: true },
    { key: "earnings", header: t("run.col.earnings"), format: "money", total: true },
    { key: "deductions", header: t("run.col.deductions"), format: "money", total: true },
    { key: "net", header: t("run.col.net"), format: "money", total: true },
    { key: "status", header: t("run.col.status") },
  ];

  async function recalculate() {
    setBusy(true);
    const r = await recalculateRun({ runId: run.id });
    setBusy(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("run.recalculated"));
    router.refresh();
  }

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href="/app/payroll" className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("run.back")}
          </Link>
          <div className={ui.row}>
            <h1 className={ui.title}>{t("run.title", { outlet: run.outlet, month })}</h1>
            <Badge tone={draft ? "neutral" : "success"}>{t(draft ? "runs.draft" : "runs.final")}</Badge>
          </div>
          <p className={ui.subtitle}>
            {!draft && run.finalisedAt
              ? t("run.finalisedBy", { actor: run.finalisedBy ?? "—", when: i18n.date(new Date(run.finalisedAt), DATE_TIME) })
              : t("run.file", { file: run.fileName, when: run.calculatedAt ? i18n.date(new Date(run.calculatedAt), DATE_TIME) : "—" })}
          </p>
        </div>
        {draft && (
          <div className={ui.row}>
            <Button variant="secondary" onClick={recalculate} loading={busy}>
              <RefreshCw size={16} aria-hidden="true" />
              {t("run.recalculate")}
            </Button>
            <ConfirmMorph
              label={t("run.finalise")}
              prompt={t("run.lockPrompt")}
              confirmLabel={t("run.finalise")}
              cancelLabel={t("common.cancel")}
              pendingLabel={t("common.loading")}
              doneLabel={t("run.finalised")}
              errorLabel={t("common.failed")}
              retryLabel={t("common.retry")}
              onConfirm={async () => {
                const r = await finalise({ runId: run.id });
                if (!r.ok) {
                  toast.error(t(r.error, r.vars));
                  throw new Error(r.error);
                }
                router.refresh();
              }}
            />
            <ConfirmMorph
              label={t("run.delete")}
              prompt={t("run.deletePrompt")}
              confirmLabel={t("run.delete")}
              cancelLabel={t("common.cancel")}
              pendingLabel={t("common.loading")}
              doneLabel={t("run.deleted")}
              errorLabel={t("common.failed")}
              retryLabel={t("common.retry")}
              onConfirm={async () => {
                const r = await deleteRun({ runId: run.id });
                if (!r.ok) {
                  toast.error(t(r.error, r.vars));
                  throw new Error(r.error);
                }
                router.push("/app/payroll");
              }}
            />
          </div>
        )}
      </header>

      {draft && run.stale && <Alert tone="info" title={t("run.stale")} />}
      {flagged > 0 && (
        <Alert tone="warning" title={i18n.tp("run.attentionTitle", flagged)}>
          {t("run.attentionBody")}
        </Alert>
      )}
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className={styles.metrics}>
        <MetricCard label={t("run.metric.net")} value={net} prefix={RM} decimals={2} locale={i18n.tag} context={month} />
        <MetricCard label={t("run.metric.dispatchers")} value={run.results.length} locale={i18n.tag} context={month} />
        <MetricCard label={t("run.metric.parcels")} value={parcels} locale={i18n.tag} context={month} />
        <MetricCard label={t("run.metric.attention")} value={flagged} locale={i18n.tag} context={month} />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        searchKeys={["name", "extId", "profile", "status"]}
        onOpen={(r) => setOpenId(r.id)}
        exportName={`${run.outlet} ${periodToInput(run.period)}`}
      />

      <Breakdown run={run} result={run.results.find((r) => r.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** How one dispatcher's pay was worked out, rule by rule; a missing vehicle/type can be set here. */
function Breakdown({ run, result, onClose }: { run: RunView; result: ResultView | null; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [key, setKey] = useState(PROFILES[0].key);
  const [saving, setSaving] = useState(false);
  const money = (cents: number) => i18n.money(cents / 100);

  function groupText(line: Line, g: Group) {
    const config = run.rules[line.versionId]?.config;
    const tier = config && config.tiers.length > 1 ? t("rule.tierHeading", { n: g.tier + 1, range: rangeLabels(i18n, config.tiers, "count")[g.tier] }) : null;
    const band = config && config.bands.length > 1 ? rangeLabels(i18n, config.bands, "kg")[g.band] : null;
    const range = [tier, band].filter(Boolean).join(" · ") || t("run.allParcels");
    return config?.valueType === "flat"
      ? t("run.flat", { range, amount: money(g.cents) })
      : t("run.line", { range, units: i18n.number(g.units), rate: i18n.rate(g.rate), amount: money(g.cents) });
  }

  async function saveProfile(dispatcherId: string) {
    const profile = PROFILES.find((p) => p.key === key);
    if (!profile) return;
    setSaving(true);
    const saved = await setProfiles({ dispatcherIds: [dispatcherId], effectiveFrom: run.period, vehicle: profile.vehicle, employment: profile.employment });
    const done = saved.ok ? await recalculateRun({ runId: run.id }) : saved;
    setSaving(false);
    if (!done.ok) return toast.error(t(done.error, done.vars));
    toast.success(t("run.recalculated"));
    router.refresh();
  }

  return (
    <Dialog open={result !== null} onOpenChange={(open) => !open && onClose()}>
      {result && (
        <DialogContent
          className={styles.wideDialog}
          title={result.name}
          description={t("run.detailHelp", { parcels: i18n.number(result.parcels), profile: result.profile ? profileLabel(i18n, result.profile) : t("profile.notSet") })}
          closeLabel={t("common.close")}
        >
          <div className={ui.stack}>
            {result.warnings.length > 0 && <Alert tone="warning" title={result.warnings.map((w) => warningText(i18n, w)).join(" · ")} />}
            {run.status === "DRAFT" && result.warnings.some((w) => w.code === "noProfile") && (
              <div className={styles.inline}>
                <label className={ui.field}>
                  <span className={ui.label}>{t("run.setProfile", { month: monthLabel(i18n, run.period) })}</span>
                  <select className={ui.input} value={key} onChange={(e) => setKey(e.target.value)}>
                    {PROFILES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {profileLabel(i18n, p)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => saveProfile(result.dispatcherId)} loading={saving}>
                  {t("run.setProfileSave")}
                </Button>
              </div>
            )}
            {result.lines.length === 0 ? (
              <p className={ui.muted}>{t("run.noLines")}</p>
            ) : (
              result.lines.map((line) => (
                <section key={line.ruleId} className={styles.line} aria-label={line.name}>
                  <div className={styles.lineHead}>
                    <span className={styles.lineName}>
                      <span className={ui.help}>{t(`kind.${line.kind}`)}</span>
                      <strong>{line.name}</strong>
                    </span>
                    <span className={styles.amount}>{money(line.cents)}</span>
                  </div>
                  <ul className={styles.groups}>
                    {line.groups.map((g) => (
                      <li key={`${g.tier}:${g.band}`}>{groupText(line, g)}</li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            <dl className={styles.totals}>
              <div>
                <dt>{t("run.total.earnings")}</dt>
                <dd>{money(result.earningsCents)}</dd>
              </div>
              <div>
                <dt>{t("run.total.deductions")}</dt>
                <dd>{money(result.deductionCents)}</dd>
              </div>
              <div>
                <dt>{t("run.total.net")}</dt>
                <dd>{money(result.netCents)}</dd>
              </div>
            </dl>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
