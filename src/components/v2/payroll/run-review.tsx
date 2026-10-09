"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, FileText, RefreshCw, Scale, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import type { Group } from "@/lib/v2/pay/engine";
import { periodToInput } from "@/lib/v2/pay/resolve";
import {
  coverRunMonth,
  deleteRun,
  finalise,
  recalculateRun,
} from "@/lib/v2/payroll/actions";
import { ADVANCE, type PayLine, type PenaltyCase } from "@/lib/v2/payroll/calc";
import type { ResultView, RunView } from "@/lib/v2/payroll/data";
import {
  confirmProfile,
  deleteProfile,
  setProfiles,
} from "@/lib/v2/people/actions";
import {
  monthLabel,
  penaltyLabel,
  PROFILES,
  profileLabel,
  rangeLabels,
  warningText,
} from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

const RM = "RM ";
const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

type Row = {
  id: string;
  name: string;
  extId: string;
  profile: string;
  parcels: number;
  earnings: number;
  deductions: number;
  net: number;
  status: string;
};

/** One outlet's month: totals, every dispatcher's pay, what needs fixing, and finalising. */
export function RunReview({
  run,
  uncovered,
  hasCard,
}: {
  run: RunView;
  uncovered: boolean;
  /** The account has a rate card at all; without one there's nothing to "use from this month". */
  hasCard: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [covering, setCovering] = useState(false);
  // Payslips and Compare render on the server: show the press until the next page is ready.
  const [going, setGoing] = useState<string | null>(null);
  const [navigating, startNav] = useTransition();
  const go = (href: string) => {
    setGoing(href);
    startNav(() => router.push(href));
  };
  const busyFor = (href: string) => navigating && going === href;
  const month = monthLabel(i18n, run.period);
  const draft = run.status === "DRAFT";
  const flagged = run.results.filter((r) => r.warnings.length > 0).length;
  // People whose only problem is a missing vehicle and type have their own card, so this alert leaves them out.
  const flaggedOther = run.results.filter((r) => r.warnings.some((w) => w.code !== "noProfile")).length;
  const parcels = run.results.reduce((n, r) => n + r.parcels, 0);
  const net = run.results.reduce((n, r) => n + r.netCents, 0) / 100;
  const stats = run.stats;
  const notes = stats
    ? (["otherOutlets", "otherMonths", "noDate"] as const)
        .filter((k) => stats[k] > 0)
        .map((k) => i18n.tp(`run.note.${k}`, stats[k]))
    : [];

  // One vehicle and type per dispatcher per month, so the run separates cleanly by it.
  const groupOf = (r: ResultView) =>
    r.profile ? profileLabel(i18n, r.profile) : t("profile.notSet");
  const byGroup = new Map<
    string,
    { label: string; dispatchers: number; parcels: number; netCents: number }
  >();
  for (const r of run.results) {
    const g = byGroup.get(groupOf(r)) ?? {
      label: groupOf(r),
      dispatchers: 0,
      parcels: 0,
      netCents: 0,
    };
    byGroup.set(g.label, {
      ...g,
      dispatchers: g.dispatchers + 1,
      parcels: g.parcels + r.parcels,
      netCents: g.netCents + r.netCents,
    });
  }
  const groups = [...byGroup.values()];
  const [group, setGroup] = useState<string | null>(null);
  const shown = group
    ? run.results.filter((r) => groupOf(r) === group)
    : run.results;

  const rows: Row[] = shown.map((r) => ({
    id: r.id,
    name: r.name,
    extId: r.extId,
    profile: r.profile ? profileLabel(i18n, r.profile) : t("profile.notSet"),
    parcels: r.parcels,
    earnings: r.earningsCents / 100,
    deductions: r.deductionCents / 100,
    net: r.netCents / 100,
    status: r.warnings.length
      ? r.warnings.map((w) => warningText(i18n, w)).join("; ")
      : t("run.ok"),
  }));
  const columns: Column<Row>[] = [
    { key: "name", header: t("run.col.name") },
    { key: "extId", header: t("run.col.id") },
    { key: "profile", header: t("run.col.profile") },
    {
      key: "parcels",
      header: t("run.col.parcels"),
      format: "number",
      total: true,
    },
    {
      key: "earnings",
      header: t("run.col.earnings"),
      format: "money",
      total: true,
    },
    {
      key: "deductions",
      header: t("run.col.deductions"),
      format: "money",
      total: true,
    },
    { key: "net", header: t("run.col.net"), format: "money", total: true },
    { key: "status", header: t("run.col.status") },
  ];

  async function cover() {
    setCovering(true);
    const r = await coverRunMonth({ runId: run.id });
    setCovering(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("run.recalculated"));
    router.refresh();
  }

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
            <h1 className={ui.title}>
              {t("run.title", { outlet: run.outlet, month })}
            </h1>
            <Badge tone={draft ? "neutral" : "success"}>
              {t(draft ? "runs.draft" : "runs.final")}
            </Badge>
          </div>
          <p className={ui.subtitle}>
            {!draft && run.finalisedAt
              ? t("run.finalisedBy", {
                  actor: run.finalisedBy ?? "—",
                  when: i18n.date(new Date(run.finalisedAt), DATE_TIME),
                })
              : t("run.file", {
                  file: run.fileName,
                  when: run.calculatedAt
                    ? i18n.date(new Date(run.calculatedAt), DATE_TIME)
                    : "—",
                })}
          </p>
        </div>
        <div className={ui.row}>
          <Button
            variant="secondary"
            loading={busyFor(`/app/payslips/${run.id}`)}
            onClick={() => go(`/app/payslips/${run.id}`)}
          >
            <FileText size={16} aria-hidden="true" />
            {t("run.payslips")}
          </Button>
          {!draft && (
            <Button variant="secondary" loading={busyFor(`/app/payroll/${run.id}/send`)} onClick={() => go(`/app/payroll/${run.id}/send`)}>
              <Send size={16} aria-hidden="true" />
              {t("run.send")}
            </Button>
          )}
          <Button
            variant="secondary"
            loading={busyFor(`/app/payroll/check?month=${run.period}`)}
            onClick={() => go(`/app/payroll/check?month=${run.period}`)}
          >
            <Scale size={16} aria-hidden="true" />
            {t("run.check")}
          </Button>
          {draft && (
            <>
              <Button variant="secondary" onClick={recalculate} loading={busy}>
                <RefreshCw size={16} aria-hidden="true" />
                {t("run.recalculate")}
              </Button>
              <ConfirmButton
                variant="primary"
                label={t("run.finalise")}
                prompt={t("run.lockPrompt")}
                confirmLabel={t("run.finalise")}
                doneLabel={t("run.finalised")}
                onConfirm={async () => {
                  const r = await finalise({ runId: run.id });
                  if (!r.ok) {
                    toast.error(t(r.error, r.vars));
                    throw new Error(r.error);
                  }
                  router.refresh();
                }}
              />
              <ConfirmButton
                confirmVariant="danger"
                label={t("run.delete")}
                prompt={t("run.deletePrompt")}
                confirmLabel={t("run.delete")}
                doneLabel={t("run.deleted")}
                onConfirm={async () => {
                  const r = await deleteRun({ runId: run.id });
                  if (!r.ok) {
                    toast.error(t(r.error, r.vars));
                    throw new Error(r.error);
                  }
                  router.push("/app/payroll");
                }}
              />
            </>
          )}
        </div>
      </header>

      {draft && run.stale && <Alert tone="info" title={t("run.stale")} />}
      {draft && !run.penaltiesChecked && (
        <div className={ui.stack}>
          <Alert tone="warning" title={t("run.penalties.title", { month })}>
            {t("run.penalties.body")}
          </Alert>
          <div className={ui.row}>
            <Link href={`/app/payroll/new?run=${run.id}`} className={ui.link}>
              {t("run.penalties.action")}
            </Link>
          </div>
        </div>
      )}
      {draft && uncovered && (
        <div className={ui.stack}>
          <Alert
            tone="warning"
            title={t("run.cover.title", { month, outlet: run.outlet })}
          >
            {hasCard ? t("run.cover.body", { month }) : t("run.cover.noCard")}
          </Alert>
          {hasCard ? (
            <div className={ui.row}>
              <Button size="sm" onClick={cover} loading={covering}>
                {t("run.cover.action", { month })}
              </Button>
              <Link href="/app/rules" className={ui.link}>
                {t("run.cover.rules")}
              </Link>
            </div>
          ) : (
            <div className={ui.row}>
              <Button size="sm" onClick={() => router.push("/app/rules")}>
                {t("run.cover.create")}
              </Button>
            </div>
          )}
        </div>
      )}
      {draft && run.profileChanges.length > 0 && <ProfileChanges run={run} />}
      {draft && <SetMissingProfiles run={run} />}
      {flaggedOther > 0 && (
        <Alert tone="warning" title={i18n.tp("run.attentionTitle", flaggedOther)}>
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
        <MetricCard
          label={t("run.metric.net")}
          value={net}
          prefix={RM}
          decimals={2}
          locale={i18n.tag}
          context={month}
        />
        <MetricCard
          label={t("run.metric.dispatchers")}
          value={run.results.length}
          locale={i18n.tag}
          context={month}
        />
        <MetricCard
          label={t("run.metric.parcels")}
          value={parcels}
          locale={i18n.tag}
          context={month}
        />
        <MetricCard
          label={t("run.metric.attention")}
          value={flagged}
          locale={i18n.tag}
          context={month}
        />
      </div>

      <section className={ui.card} aria-labelledby="by-profile">
        <h2 id="by-profile" className={ui.cardTitle}>
          {t("run.byProfile")}
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("run.col.profile")}</th>
                <th scope="col" data-numeric>
                  {t("run.metric.dispatchers")}
                </th>
                <th scope="col" data-numeric>
                  {t("run.metric.parcels")}
                </th>
                <th scope="col" data-numeric>
                  {t("run.metric.net")}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label}>
                  <th scope="row">
                    <button
                      type="button"
                      className={styles.open}
                      aria-pressed={group === g.label}
                      onClick={() =>
                        setGroup(group === g.label ? null : g.label)
                      }
                    >
                      {g.label}
                    </button>
                  </th>
                  <td data-numeric>{i18n.number(g.dispatchers)}</td>
                  <td data-numeric>{i18n.number(g.parcels)}</td>
                  <td data-numeric>{i18n.money(g.netCents / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {group && (
        <div className={ui.row}>
          <h2 className={ui.cardTitle}>
            {t("run.showingProfile", { profile: group })}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setGroup(null)}>
            {t("run.showAll")}
          </Button>
        </div>
      )}
      <DataTable
        key={group ?? "all"}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowLabel={(r) => r.name}
        searchKeys={["name", "extId", "profile", "status"]}
        onOpen={(r) => setOpenId(r.id)}
        exportName={`${run.outlet} ${periodToInput(run.period)}${group ? ` ${group}` : ""}`}
      />

      <Breakdown
        run={run}
        result={run.results.find((r) => r.id === openId) ?? null}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

/** Everyone the run couldn't pay for lack of a vehicle and type, set in one go from the run's month. */
function SetMissingProfiles({ run }: { run: RunView }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const missing = run.results.filter((r) => r.warnings.some((w) => w.code === "noProfile")).map((r) => r.dispatcherId);
  if (missing.length === 0) return null;

  async function save() {
    const profile = PROFILES.find((p) => p.key === key);
    if (!profile) return;
    setSaving(true);
    const saved = await setProfiles({ dispatcherIds: missing, effectiveFrom: run.period, vehicle: profile.vehicle, employment: profile.employment });
    const done = saved.ok ? await recalculateRun({ runId: run.id }) : saved;
    setSaving(false);
    if (!done.ok) return toast.error(t(done.error, done.vars));
    toast.success(t("run.recalculated"));
    router.refresh();
  }

  return (
    <div className={ui.stack}>
      <Alert tone="warning" title={tp("run.missing.title", missing.length, { month: monthLabel(i18n, run.period) })}>
        {t("run.missing.body")}
      </Alert>
      <div className={styles.inline}>
        <select className={ui.input} value={key} onChange={(e) => setKey(e.target.value)} aria-label={t("run.col.profile")}>
          <option value="" disabled>
            {t("profile.choose")}
          </option>
          {PROFILES.map((p) => (
            <option key={p.key} value={p.key}>
              {profileLabel(i18n, p)}
            </option>
          ))}
        </select>
        <Button onClick={save} loading={saving} disabled={!key}>
          {tp("run.missing.action", missing.length)}
        </Button>
      </div>
    </div>
  );
}

/** Vehicle/type changes from last month: pay as the new one, or keep last month's for this month too. */
function ProfileChanges({ run }: { run: RunView }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const names = new Map(run.results.map((r) => [r.dispatcherId, r.name]));

  async function settle(id: string, keep: boolean) {
    setBusy(id);
    // Keeping last month's means this month has no row of its own, so the run must be worked out again.
    const r = keep
      ? await deleteProfile({ profileId: id })
      : await confirmProfile({ profileId: id });
    const done = keep && r.ok ? await recalculateRun({ runId: run.id }) : r;
    setBusy(null);
    if (!done.ok) return toast.error(t(done.error, done.vars));
    toast.success(t(keep ? "run.changes.kept" : "run.changes.confirmed"));
    router.refresh();
  }

  return (
    <div className={ui.stack}>
      <Alert
        tone="warning"
        title={tp("run.changes.title", run.profileChanges.length)}
      >
        {t("run.changes.body")}
      </Alert>
      <ul className={ui.list}>
        {run.profileChanges.map((c) => {
          const from = profileLabel(i18n, c.from);
          const to = profileLabel(i18n, c.to);
          return (
            <li key={c.profileId} className={styles.inline}>
              <span>
                {t("run.changes.line", {
                  name: names.get(c.dispatcherId) ?? "",
                  from,
                  fromMonth: monthLabel(i18n, c.from.effectiveFrom),
                  to,
                })}
              </span>
              <Button
                size="sm"
                onClick={() => settle(c.profileId, false)}
                loading={busy === c.profileId}
              >
                {t("run.changes.useNew", { profile: to })}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => settle(c.profileId, true)}
                disabled={busy !== null}
              >
                {t("run.changes.keepOld", { profile: from })}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** How one dispatcher's pay was worked out, rule by rule; a missing vehicle/type can be set here. */
function Breakdown({
  run,
  result,
  onClose,
}: {
  run: RunView;
  result: ResultView | null;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const money = (cents: number) => i18n.money(cents / 100);

  function groupText(line: PayLine, g: Group) {
    const config = run.rules[line.versionId]?.config;
    const heading = line.penalty ? "rule.tierHeadingCases" : "rule.tierHeading";
    const tier =
      config && config.tiers.length > 1
        ? t(heading, {
            n: g.tier + 1,
            range: rangeLabels(i18n, config.tiers, "count")[g.tier],
          })
        : null;
    const band =
      config && config.bands.length > 1
        ? rangeLabels(i18n, config.bands, "kg")[g.band]
        : null;
    const range =
      [tier, band].filter(Boolean).join(" · ") || t("run.allParcels");
    return config?.valueType === "flat"
      ? t("run.flat", { range, amount: money(g.cents) })
      : t("run.line", {
          range,
          units: i18n.number(g.units),
          rate: i18n.rate(g.rate),
          amount: money(g.cents),
        });
  }

  /** One penalty case: when, which parcel, why; with the file's amount when that's what is deducted. */
  function caseText(c: PenaltyCase, fromFile: boolean) {
    const when = c.occurredAt
      ? i18n.date(new Date(`${c.occurredAt.slice(0, 10)}T00:00:00Z`), {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        })
      : null;
    return [
      when,
      c.waybill,
      c.note,
      fromFile && c.amountCents !== null ? money(c.amountCents) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function saveProfile(dispatcherId: string) {
    const profile = PROFILES.find((p) => p.key === key);
    if (!profile) return;
    setSaving(true);
    const saved = await setProfiles({
      dispatcherIds: [dispatcherId],
      effectiveFrom: run.period,
      vehicle: profile.vehicle,
      employment: profile.employment,
    });
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
          description={t("run.detailHelp", {
            parcels: i18n.number(result.parcels),
            profile: result.profile
              ? profileLabel(i18n, result.profile)
              : t("profile.notSet"),
          })}
          closeLabel={t("common.close")}
        >
          <div className={ui.stack}>
            {result.warnings.length > 0 && (
              <Alert
                tone="warning"
                title={result.warnings
                  .map((w) => warningText(i18n, w))
                  .join(" · ")}
              />
            )}
            {run.status === "DRAFT" &&
              result.warnings.some((w) => w.code === "noProfile") && (
                <div className={styles.inline}>
                  <label className={ui.field}>
                    <span className={ui.label}>
                      {t("run.setProfile", {
                        month: monthLabel(i18n, run.period),
                      })}
                    </span>
                    <select
                      className={ui.input}
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                    >
                      <option value="" disabled>
                        {t("profile.choose")}
                      </option>
                      {PROFILES.map((p) => (
                        <option key={p.key} value={p.key}>
                          {profileLabel(i18n, p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    onClick={() => saveProfile(result.dispatcherId)}
                    loading={saving}
                    disabled={!key}
                  >
                    {t("run.setProfileSave")}
                  </Button>
                </div>
              )}
            {result.lines.length === 0 ? (
              <p className={ui.muted}>{t("run.noLines")}</p>
            ) : (
              result.lines.map((line) => {
                const fromFile = line.ruleId.startsWith("file:");
                const name = fromFile ? t("run.fromFile") : line.ruleId === ADVANCE ? t("advance.line") : line.name;
                return (
                  <section
                    key={line.ruleId}
                    className={styles.line}
                    aria-label={
                      line.penalty
                        ? `${penaltyLabel(i18n, line.penalty)}: ${name}`
                        : name
                    }
                  >
                    <div className={styles.lineHead}>
                      <span className={styles.lineName}>
                        <span
                          className={ui.help}
                          title={
                            line.penalty
                              ? undefined
                              : t(`kind.${line.kind}.help`)
                          }
                        >
                          {line.penalty
                            ? penaltyLabel(i18n, line.penalty)
                            : t(`kind.${line.kind}`)}
                        </span>
                        <strong>{name}</strong>
                      </span>
                      <span className={styles.amount}>{money(line.cents)}</span>
                    </div>
                    <ul className={styles.groups}>
                      {line.groups.map((g) => (
                        <li key={`${g.tier}:${g.band}`}>
                          {groupText(line, g)}
                        </li>
                      ))}
                      {result.penalties
                        .filter((c) => c.type === line.penalty)
                        .map((c) => (
                          <li key={c.id} className={ui.help}>
                            {caseText(c, fromFile)}
                          </li>
                        ))}
                    </ul>
                  </section>
                );
              })
            )}
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  router.push(`/app/payslips/${run.id}?d=${result.id}`)
                }
              >
                <FileText size={16} aria-hidden="true" />
                {t("run.payslip")}
              </Button>
            </div>
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
