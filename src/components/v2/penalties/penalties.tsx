"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import type { I18n } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/en";
import { PENALTY_TYPES } from "@/lib/v2/pay/config";
import { periodToInput } from "@/lib/v2/pay/resolve";
import { assignPenalty, deletePenaltyImport, ignorePenalty, setPenaltyWaived, undoPenaltyDecision } from "@/lib/v2/penalties/actions";
import type { PenaltyItemView, PenaltyMonth, PersonOption } from "@/lib/v2/penalties/data";
import { monthLabel, penaltyLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./penalties.module.css";
import { PenaltyImport } from "./penalty-import";

const RM = "RM ";
const DATE_TIME: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

/** "Ahmad Faiz · KUL4602001 · KUL4602": the person as the file names them. */
const inFile = (i: Pick<PenaltyItemView, "name" | "extId" | "outlet" | "waybill">) => [i.name, i.extId, i.outlet].filter(Boolean).join(" · ") || (i.waybill ?? "—");
const fileAmount = (items: PenaltyItemView[]) => items.reduce((sum, i) => sum + (i.status === "MATCHED" && !i.waived ? (i.amountCents ?? 0) : 0), 0);

function statusText(i18n: I18n, item: PenaltyItemView, withName = false) {
  const status = withName && item.status === "MATCHED" && item.dispatcher ? i18n.t("penalties.matchedTo", { name: item.dispatcher.name }) : i18n.t(`penalties.status.${item.status}`);
  return item.waived ? `${status} · ${i18n.t("penalties.status.waived")}` : status;
}

type Row = { id: string; date: string; type: string; waybill: string; inFile: string; dispatcher: string; amount: number | ""; status: string };

/** A month's QC penalties: import files, give unmatched cases a dispatcher, check every case. */
export function Penalties({ data, people }: { data: PenaltyMonth; people: PersonOption[] }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const month = monthLabel(i18n, data.period);
  const { items } = data;
  const unmatched = items.filter((i) => i.status === "UNMATCHED");

  const rows: Row[] = items.map((i) => ({
    id: i.id,
    date: i.occurredAt?.slice(0, 10) ?? "—",
    type: penaltyLabel(i18n, i.type),
    waybill: i.waybill ?? "—",
    inFile: inFile(i),
    dispatcher: i.dispatcher?.name ?? "—",
    amount: i.amountCents === null ? "" : i.amountCents / 100,
    status: statusText(i18n, i),
  }));
  const columns: Column<Row>[] = [
    { key: "date", header: t("penalties.col.date") },
    { key: "type", header: t("penalties.col.type") },
    { key: "waybill", header: t("penalties.col.waybill") },
    { key: "inFile", header: t("penalties.col.inFile") },
    { key: "dispatcher", header: t("penalties.col.dispatcher") },
    { key: "amount", header: t("penalties.field.amount"), format: "money", total: true },
    { key: "status", header: t("penalties.col.status") },
  ];

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("penalties.title")}</h1>
          <p className={ui.subtitle}>{t("penalties.subtitle")}</p>
        </div>
      </header>

      <PenaltyImport defaultPeriod={data.period} />

      {items.length === 0 ? (
        <EmptyState title={t("penalties.emptyTitle", { month })} description={t("penalties.emptyBody")} />
      ) : (
        <>
          <div className={styles.metrics}>
            <MetricCard label={t("penalties.metric.cases")} value={items.length} locale={i18n.tag} context={month} />
            <MetricCard label={t("penalties.metric.amount")} value={fileAmount(items) / 100} prefix={RM} decimals={2} locale={i18n.tag} context={month} />
            <MetricCard label={t("penalties.metric.unmatched")} value={unmatched.length} locale={i18n.tag} context={month} />
            <MetricCard label={t("penalties.metric.waived")} value={items.filter((i) => i.waived).length} locale={i18n.tag} context={month} />
          </div>

          {unmatched.length > 0 && <Queue unmatched={unmatched} people={people} />}

          <section className={ui.card} aria-labelledby="by-type-title">
            <div>
              <h2 id="by-type-title" className={ui.cardTitle}>
                {t("penalties.byType")}
              </h2>
              <p className={ui.help}>{t("penalties.ruleNote")}</p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{t("penalties.col.type")}</th>
                    <th scope="col" data-numeric>
                      {t("penalties.col.cases")}
                    </th>
                    <th scope="col" data-numeric>
                      {t("penalties.col.unmatched")}
                    </th>
                    <th scope="col" data-numeric>
                      {t("penalties.col.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PENALTY_TYPES.filter((type) => items.some((i) => i.type === type)).map((type) => {
                    const ofType = items.filter((i) => i.type === type);
                    return (
                      <tr key={type}>
                        <th scope="row">{penaltyLabel(i18n, type)}</th>
                        <td data-numeric>{i18n.number(ofType.length)}</td>
                        <td data-numeric>{i18n.number(ofType.filter((i) => i.status === "UNMATCHED").length)}</td>
                        <td data-numeric>{i18n.money(fileAmount(ofType) / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={ui.stack} aria-labelledby="cases-title">
            <h2 id="cases-title" className={ui.cardTitle}>
              {t("penalties.all")}
            </h2>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              rowLabel={(r) => r.inFile}
              searchKeys={["date", "type", "waybill", "inFile", "dispatcher", "status"]}
              onOpen={(r) => setOpenId(r.id)}
              exportName={`${t("penalties.title")} ${periodToInput(data.period)}`}
              labels={{ search: "penalties.search", rows: "penalties.rows", empty: "penalties.tableEmpty" }}
            />
          </section>
        </>
      )}

      {data.imports.length > 0 && (
        <section className={ui.card} aria-labelledby="files-title">
          <h2 id="files-title" className={ui.cardTitle}>
            {t("penalties.files", { month })}
          </h2>
          <ul className={ui.list}>
            {data.imports.map((f) => (
              <li key={f.id}>
                <span className={styles.who}>
                  <strong>{f.fileName}</strong>
                  <span className={ui.help}>
                    {t("penalties.fileLine", { when: i18n.date(new Date(f.createdAt), DATE_TIME), actor: f.actor ?? "—", added: f.added, updated: f.updated })}
                  </span>
                </span>
                <ConfirmButton
                  confirmVariant="danger"
                  label={t("penalties.remove")}
                  prompt={tp("penalties.removePrompt", f.items)}
                  confirmLabel={t("penalties.remove")}
                  doneLabel={t("penalties.removed")}
                  onConfirm={async () => {
                    const r = await deletePenaltyImport({ importId: f.id });
                    if (!r.ok) {
                      toast.error(t(r.error, r.vars));
                      throw new Error(r.error);
                    }
                    router.refresh();
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <CaseDialog item={items.find((i) => i.id === openId) ?? null} people={people} onClose={() => setOpenId(null)} />
    </div>
  );
}

function personOptions(people: PersonOption[]) {
  return people.map((p) => ({ value: p.id, label: p.detail ? `${p.name} (${p.detail})` : p.name, keywords: [p.detail] }));
}

/** Cases naming someone who isn't (only) one dispatcher, grouped by that person. */
function Queue({ unmatched, people }: { unmatched: PenaltyItemView[]; people: PersonOption[] }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const groups = new Map<string, PenaltyItemView[]>();
  for (const item of unmatched) {
    // The same identity a decision is remembered under: the J&T ID, else the name.
    const key = item.extId ? `id:${item.extId}` : item.name ? `name:${item.name.trim().toUpperCase()}` : item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <section className={ui.card} aria-labelledby="queue-title">
      <div>
        <h2 id="queue-title" className={ui.cardTitle}>
          {t("penalties.queue")}
        </h2>
        <p className={ui.help}>{t("penalties.queueHelp")}</p>
      </div>
      <div className={styles.queue}>
        {[...groups.values()].map((cases) => (
          <QueueRow key={cases[0].id} cases={cases} people={people} label={inFile(cases[0])} detail={`${tp("penalties.cases", cases.length)} · ${[...new Set(cases.map((c) => penaltyLabel(i18n, c.type)))].join(", ")}`} />
        ))}
      </div>
    </section>
  );
}

function QueueRow({ cases, people, label, detail }: { cases: PenaltyItemView[]; people: PersonOption[]; label: string; detail: string }) {
  const { t } = useI18n();
  const options = personOptions(people);
  return (
    <div className={styles.queueRow}>
      <span className={styles.who}>
        <strong>{label}</strong>
        <span className={ui.help}>{detail}</span>
      </span>
      <Decide item={cases[0]} options={options} />
      <IgnoreButton itemId={cases[0].id} label={t("penalties.ignore")} />
    </div>
  );
}

/** Pick a dispatcher for a case; applies to every case naming the same person. */
function Decide({ item, options }: { item: PenaltyItemView; options: { value: string; label: string; keywords: string[] }[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [dispatcherId, setDispatcherId] = useState(item.dispatcher?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!dispatcherId) return;
    setSaving(true);
    const r = await assignPenalty({ itemId: item.id, dispatcherId });
    setSaving(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    const name = options.find((o) => o.value === dispatcherId)?.label ?? "";
    toast.success(i18n.tp("penalties.matched", r.data.count, { name }));
    router.refresh();
  }

  return (
    <div className={styles.actions}>
      <Combobox
        label={t("penalties.matchTo")}
        options={options}
        value={dispatcherId}
        onValueChange={setDispatcherId}
        placeholder={t("penalties.pick")}
        emptyMessage={t("penalties.noPeople")}
        clearLabel={t("common.clear")}
      />
      <div className={ui.row}>
        <Button onClick={save} loading={saving} disabled={!dispatcherId || dispatcherId === item.dispatcher?.id}>
          {t("penalties.match")}
        </Button>
      </div>
    </div>
  );
}

function IgnoreButton({ itemId, label }: { itemId: string; label: string }) {
  const i18n = useI18n();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  return (
    <div className={ui.row}>
      <Button
        variant="secondary"
        loading={saving}
        onClick={async () => {
          setSaving(true);
          const r = await ignorePenalty({ itemId });
          setSaving(false);
          if (!r.ok) return toast.error(i18n.t(r.error, r.vars));
          toast.success(i18n.tp("penalties.ignored", r.data.count));
          router.refresh();
        }}
      >
        {label}
      </Button>
    </div>
  );
}

/** One case: what the file says, who it's matched to, and changing that or waiving it. */
function CaseDialog({ item, people, onClose }: { item: PenaltyItemView | null; people: PersonOption[]; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const options = personOptions(people);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: MessageKey }>, done: MessageKey) {
    setBusy(true);
    const r = await action();
    setBusy(false);
    if (!r.ok) return toast.error(t(r.error ?? "common.failed"));
    toast.success(t(done));
    router.refresh();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item && (
        <DialogContent className={styles.dialog} title={penaltyLabel(i18n, item.type)} description={item.waybill ?? inFile(item)} closeLabel={t("common.close")}>
          <div className={ui.stack}>
            <div className={ui.row}>
              <Badge tone={item.status === "MATCHED" ? "success" : item.status === "UNMATCHED" ? "warning" : "neutral"}>{statusText(i18n, item, true)}</Badge>
              {item.decided && <span className={ui.help}>{t("penalties.byHand")}</span>}
            </div>
            <dl className={styles.facts}>
              {(
                [
                  ["date", item.occurredAt ? item.occurredAt.replace("T", " ") : null],
                  ["waybill", item.waybill],
                  ["name", item.name],
                  ["extId", item.extId],
                  ["outlet", item.outlet],
                  ["amount", item.amountCents === null ? null : i18n.money(item.amountCents / 100)],
                  ["appeal", item.appeal],
                  ["note", item.note],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([field, value]) => (
                  <Fragment key={field}>
                    <dt>{t(`penalties.field.${field}`)}</dt>
                    <dd>{value}</dd>
                  </Fragment>
                ))}
              <dt>{t("penalties.detail.file")}</dt>
              <dd>{item.fileName}</dd>
            </dl>

            <Decide key={item.id} item={item} options={options} />
            {(item.extId || item.name) && <p className={ui.help}>{t("penalties.appliesAll", { who: item.name ?? item.extId ?? "" })}</p>}

            <div className={ui.row}>
              {item.status !== "IGNORED" && <IgnoreButton itemId={item.id} label={t("penalties.ignore")} />}
              {item.decided && (
                <Button variant="secondary" loading={busy} onClick={() => run(() => undoPenaltyDecision({ itemId: item.id }), "penalties.undone")}>
                  {t("penalties.undo")}
                </Button>
              )}
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => run(() => setPenaltyWaived({ itemId: item.id, waived: !item.waived }), item.waived ? "penalties.unwaivedDone" : "penalties.waivedDone")}
              >
                {t(item.waived ? "penalties.unwaive" : "penalties.waive")}
              </Button>
            </div>
            <p className={ui.help}>{t(item.decided ? "penalties.undoHelp" : "penalties.waiveHelp")}</p>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
