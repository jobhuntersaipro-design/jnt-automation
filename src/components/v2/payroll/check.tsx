"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, FileUp, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Select } from "@/components/arc/select/select";
import { Switch } from "@/components/arc/switch/switch";
import { Textarea } from "@/components/arc/textarea/textarea";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import type { I18n } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/en";
import type { Kind } from "@/lib/v2/pay/config";
import { periodToInput } from "@/lib/v2/pay/resolve";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { deleteCheck, saveCheckNote } from "@/lib/v2/payroll/actions";
import type { CheckView } from "@/lib/v2/payroll/check";
import { compareCheck, MEASURES, planCheck, readSheetPeople, type CheckLine, type CheckPlan, type Measure } from "@/lib/v2/payroll/reconcile";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

type Failure = { error: MessageKey; vars?: Record<string, string | number> };

function measureLabel(i18n: I18n, m: Measure) {
  return m.startsWith("kind:") ? i18n.t(`kind.${m.slice(5) as Kind}`) : i18n.t(`check.measure.${m as "net" | "earnings" | "deductions" | "parcels"}`);
}
const figure = (i18n: I18n, m: Measure, v: number | null) => (v === null ? "—" : m === "parcels" ? i18n.number(v) : i18n.money(v / 100));

type Row = { key: string; name: string; extId: string; measure: string; sheet: string; app: string; difference: string; status: string; note: string };

/** A month's pay against the agent's own payroll sheet, figure by figure, with notes on differences. */
export function Check({ view }: { view: CheckView }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const month = monthLabel(i18n, view.period);
  const check = view.check;

  const lines = useMemo(() => (check ? compareCheck(check.people, view.app, check.plan.measures.map((m) => m.measure)) : []), [check, view.app]);
  const notes = check?.notes ?? {};
  const open = (l: CheckLine) => l.status !== "match" && !notes[l.key]?.excluded;
  const counts = {
    people: new Set(lines.filter((l) => l.status === "match" || l.status === "differs").map((l) => l.person)).size,
    match: lines.filter((l) => l.status === "match").length,
    open: lines.filter(open).length,
    explained: lines.filter((l) => l.status !== "match" && notes[l.key]?.excluded).length,
  };
  const statusText = (l: CheckLine) => (notes[l.key]?.excluded ? t("check.status.explained") : t(`check.status.${l.status}`));
  const rows: Row[] = lines
    .filter((l) => showAll || l.status !== "match")
    .map((l) => ({
      key: l.key,
      name: l.name ?? "—",
      extId: l.extId ?? "—",
      measure: measureLabel(i18n, l.measure),
      sheet: figure(i18n, l.measure, l.sheet),
      app: figure(i18n, l.measure, l.app),
      difference: l.sheet !== null && l.app !== null ? figure(i18n, l.measure, l.app - l.sheet) : "—",
      status: statusText(l),
      note: notes[l.key]?.note ?? "",
    }));
  const columns: Column<Row>[] = [
    { key: "name", header: t("check.col.name") },
    { key: "extId", header: t("check.col.id") },
    { key: "measure", header: t("check.col.figure") },
    { key: "sheet", header: t("check.col.sheet") },
    { key: "app", header: t("check.col.app") },
    { key: "difference", header: t("check.col.difference") },
    { key: "status", header: t("check.col.status") },
    { key: "note", header: t("check.col.note") },
  ];

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href="/app/payroll" className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("run.back")}
          </Link>
          <h1 className={ui.title}>{t("check.title")}</h1>
          <p className={ui.subtitle}>{t("check.subtitle")}</p>
        </div>
      </header>

      {view.runs.length === 0 ? (
        <EmptyState title={t("check.noRuns", { month })} description={t("check.noRunsBody")} />
      ) : (
        <>
          <SheetUpload period={view.period} hasCheck={check !== null} />
          {view.runs.some((r) => r.status === "DRAFT") && <Alert tone="info" title={t("check.drafts")} />}
          {check && (
            <>
              <div className={styles.metrics}>
                <MetricCard label={t("check.metric.people")} value={counts.people} locale={i18n.tag} context={month} />
                <MetricCard label={t("check.metric.match")} value={counts.match} locale={i18n.tag} context={month} />
                <MetricCard label={t("check.metric.open")} value={counts.open} locale={i18n.tag} context={month} />
                <MetricCard label={t("check.metric.explained")} value={counts.explained} locale={i18n.tag} context={month} />
              </div>
              {counts.open === 0 ? <Alert tone="success" title={t("check.allMatch")} /> : <Alert tone="warning" title={i18n.tp("check.openTitle", counts.open)}>{t("check.openBody")}</Alert>}
              <section className={ui.stack} aria-labelledby="check-lines">
                <div className={ui.row}>
                  <h2 id="check-lines" className={ui.cardTitle}>
                    {t("check.lines")}
                  </h2>
                  <Switch label={t("check.showAll")} checked={showAll} onCheckedChange={setShowAll} />
                </div>
                <p className={ui.help}>{t("check.from", { file: check.fileName, when: i18n.date(new Date(check.updatedAt)) })}</p>
                <DataTable
                  rows={rows}
                  columns={columns}
                  rowKey={(r) => r.key}
                  rowLabel={(r) => `${r.name} ${r.measure}`}
                  searchKeys={["name", "extId", "measure", "status", "note"]}
                  onOpen={(r) => setOpenKey(r.key)}
                  exportName={`${t("check.title")} ${periodToInput(view.period)}`}
                  labels={{ search: "check.search", rows: "check.rows", empty: "check.empty" }}
                />
              </section>
              <div>
                <ConfirmButton
                  confirmVariant="danger"
                  label={t("check.remove")}
                  prompt={t("check.removePrompt")}
                  confirmLabel={t("check.remove")}
                  doneLabel={t("penalties.removed")}
                  onConfirm={async () => {
                    const r = await deleteCheck({ period: view.period });
                    if (!r.ok) throw new Error(r.error);
                    router.refresh();
                  }}
                />
              </div>
              <NoteDialog key={openKey ?? ""} period={view.period} line={lines.find((l) => l.key === openKey) ?? null} note={openKey ? notes[openKey] : undefined} onClose={() => setOpenKey(null)} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Upload the agent's sheet, say which columns hold the person and which figures, then compare. */
function SheetUpload({ period, hasCheck }: { period: number; hasCheck: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ file: File; sheets: Sheet[] } | null>(null);
  const [plan, setPlan] = useState<CheckPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheet = file?.sheets.find((s) => s.name === plan?.sheet);
  const people = useMemo(() => (sheet && plan ? readSheetPeople(sheet, plan) : []), [sheet, plan]);

  async function post<T>(form: FormData): Promise<T | Failure> {
    const res = await fetch("/api/v2/payroll/check", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as T | Failure | null;
    if (!res?.ok || !body) return body && typeof body === "object" && "error" in body ? (body as Failure) : { error: "sheet.err.unreadable" };
    return body;
  }

  async function read(picked: File) {
    setError(null);
    setBusy(true);
    const form = new FormData();
    form.set("file", picked);
    const body = await post<{ sheets: Sheet[] }>(form);
    setBusy(false);
    if ("error" in body) return setError(t(body.error, body.vars));
    const first = body.sheets.map(planCheck).find((p) => p.measures.length > 0) ?? planCheck(body.sheets[0]);
    setFile({ file: picked, sheets: body.sheets });
    setPlan(first);
  }

  async function compare() {
    if (!file || !plan) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file.file);
    form.set("plan", JSON.stringify({ period, plan }));
    const body = await post<{ people: number }>(form);
    setBusy(false);
    if ("error" in body) return setError(t(body.error, body.vars));
    toast.success(i18n.tp("check.compared", body.people));
    setFile(null);
    router.refresh();
  }

  const header = sheet?.rows[plan?.headerRow ?? 0] ?? [];
  const columnOptions = (none: boolean) => [
    ...(none ? [{ value: "none", label: t("penalties.notUsed") }] : []),
    ...header.map((h, c) => ({ value: String(c), label: t("penalties.column", { letter: String.fromCharCode(65 + (c % 26)), header: h || "—" }) })),
  ];
  const setWho = (field: "extId" | "name", v: string) => plan && setPlan({ ...plan, [field]: v === "none" ? undefined : Number(v) });
  const ready = plan && (plan.extId !== undefined || plan.name !== undefined) && plan.measures.length > 0 && people.length > 0;

  return (
    <section className={ui.card} aria-labelledby="sheet-title">
      <div>
        <h2 id="sheet-title" className={ui.cardTitle}>
          {t(hasCheck ? "check.uploadAgain" : "check.upload")}
        </h2>
        <p className={ui.help}>{t("check.uploadHelp")}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void read(picked);
        }}
      />
      <div>
        <Button variant={hasCheck || file ? "secondary" : "primary"} onClick={() => input.current?.click()} loading={busy && !file}>
          <FileUp size={16} aria-hidden="true" />
          {t(hasCheck ? "check.uploadAgain" : "check.upload")}
        </Button>
      </div>
      {error && <Alert tone="danger" title={error} />}
      {file && plan && (
        <div className={ui.stack}>
          <div className={styles.inline}>
            {file.sheets.length > 1 && (
              <Select label={t("check.sheet")} value={plan.sheet} onValueChange={(name) => setPlan(planCheck(file.sheets.find((s) => s.name === name)!))} options={file.sheets.map((s) => ({ value: s.name, label: s.name }))} />
            )}
            <label className={ui.field}>
              <span className={ui.label}>{t("penalties.headerRow")}</span>
              <input
                type="number"
                className={ui.input}
                min={1}
                value={plan.headerRow + 1}
                onChange={(e) => {
                  const headerRow = Math.max(0, Math.floor(Number(e.target.value)) - 1);
                  if (Number.isFinite(headerRow)) setPlan({ ...plan, headerRow });
                }}
              />
            </label>
            <Select label={t("penalties.field.extId")} value={plan.extId === undefined ? "none" : String(plan.extId)} onValueChange={(v) => setWho("extId", v)} options={columnOptions(true)} />
            <Select label={t("penalties.field.name")} value={plan.name === undefined ? "none" : String(plan.name)} onValueChange={(v) => setWho("name", v)} options={columnOptions(true)} />
          </div>
          <h3 className={ui.sectionTitle}>{t("check.figures")}</h3>
          {plan.measures.map((m, i) => (
            <div key={i} className={styles.inline}>
              <Select
                label={t("check.col.figure")}
                value={m.measure}
                onValueChange={(v) => setPlan({ ...plan, measures: plan.measures.map((x, j) => (j === i ? { ...x, measure: v as Measure } : x)) })}
                options={MEASURES.map((x) => ({ value: x, label: measureLabel(i18n, x) }))}
              />
              <Select
                label={t("check.column")}
                value={String(m.column)}
                onValueChange={(v) => setPlan({ ...plan, measures: plan.measures.map((x, j) => (j === i ? { ...x, column: Number(v) } : x)) })}
                options={columnOptions(false)}
              />
              <Button variant="ghost" size="sm" aria-label={t("common.delete")} onClick={() => setPlan({ ...plan, measures: plan.measures.filter((_, j) => j !== i) })}>
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={header.length === 0}
              onClick={() => setPlan({ ...plan, measures: [...plan.measures, { measure: MEASURES.find((x) => !plan.measures.some((m) => m.measure === x)) ?? "net", column: 0 }] })}
            >
              <Plus size={16} aria-hidden="true" />
              {t("check.addFigure")}
            </Button>
          </div>
          <p className={ui.help}>{i18n.tp("check.found", people.length)}</p>
          <div className={ui.row}>
            <Button onClick={compare} loading={busy} disabled={!ready}>
              {t("check.compare")}
            </Button>
            <Button variant="ghost" onClick={() => setFile(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function NoteDialog({ period, line, note, onClose }: { period: number; line: CheckLine | null; note?: { note: string; excluded: boolean }; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [text, setText] = useState(note?.note ?? "");
  const [excluded, setExcluded] = useState(note?.excluded ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!line) return;
    setSaving(true);
    const r = await saveCheckNote({ period, key: line.key, note: text, excluded });
    setSaving(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("settings.saved"));
    router.refresh();
    onClose();
  }

  return (
    <Dialog open={line !== null} onOpenChange={(o) => !o && onClose()}>
      {line && (
        <DialogContent
          key={line.key}
          title={`${line.name ?? line.extId ?? ""} · ${measureLabel(i18n, line.measure)}`}
          description={t("check.noteHelp", { sheet: figure(i18n, line.measure, line.sheet), app: figure(i18n, line.measure, line.app) })}
          closeLabel={t("common.close")}
        >
          <div className={ui.stack}>
            <Textarea label={t("check.col.note")} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} />
            <Switch label={t("check.exclude")} checked={excluded} onCheckedChange={setExcluded} />
            <div>
              <Button onClick={save} loading={saving}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
