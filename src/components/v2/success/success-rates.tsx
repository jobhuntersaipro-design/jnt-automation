"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Select } from "@/components/arc/select/select";
import { DecimalInput } from "@/components/v2/decimal-input";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { deleteSuccessRate, setSuccessRate } from "@/lib/v2/success/actions";
import type { IdOption, SuccessMonth } from "@/lib/v2/success/data";
import { FIELDS, readable, readReport, type Field, type ReportPlan } from "@/lib/v2/success/report";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import table from "../payroll/payroll.module.css";

type Failure = { error: MessageKey; vars?: Record<string, string | number> };
const pct = (bp: number) => `${(bp / 100).toFixed(2)}%`;
const idLabel = (o: IdOption) => `${o.name} (${o.outlet} · ${o.extId})`;

/** Upload J&T's report, check the columns it was read by, import. */
function ReportUpload({ period }: { period: number }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ file: File; sheets: Sheet[] } | null>(null);
  const [plan, setPlan] = useState<ReportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheet = file?.sheets.find((s) => s.name === plan?.sheet);
  const read = useMemo(() => (sheet && plan && readable(plan.columns) ? readReport(sheet, plan) : null), [sheet, plan]);

  async function post<T>(form: FormData): Promise<T | Failure> {
    const res = await fetch("/api/v2/success-rates", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as T | Failure | null;
    if (!res?.ok || !body) return body && typeof body === "object" && "error" in body ? (body as Failure) : { error: "sheet.err.unreadable" };
    return body;
  }

  async function open(picked: File) {
    setError(null);
    setBusy(true);
    const form = new FormData();
    form.set("file", picked);
    const body = await post<{ sheets: Sheet[]; plan: ReportPlan | null }>(form);
    setBusy(false);
    if ("error" in body) return setError(t(body.error, body.vars));
    setFile({ file: picked, sheets: body.sheets });
    setPlan(body.plan ?? { sheet: body.sheets[0]?.name ?? "", headerRow: 0, columns: {} });
    if (!body.plan) setError(t("success.err.columns"));
  }

  async function save() {
    if (!file || !plan) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file.file);
    form.set("plan", JSON.stringify(plan));
    form.set("period", String(period));
    const body = await post<{ saved: number; skipped: number; others: number }>(form);
    setBusy(false);
    if ("error" in body) return setError(t(body.error, body.vars));
    toast.success(t("success.imported", { saved: body.saved, skipped: body.skipped + body.others }));
    setFile(null);
    router.refresh();
  }

  const header = sheet?.rows[plan?.headerRow ?? 0] ?? [];
  const options = [{ value: "none", label: t("penalties.notUsed") }, ...header.map((h, c) => ({ value: String(c), label: t("penalties.column", { letter: String.fromCharCode(65 + (c % 26)), header: h || "—" }) }))];
  const setColumn = (f: Field, v: string) => plan && setPlan({ ...plan, columns: { ...plan.columns, [f]: v === "none" ? undefined : Number(v) } });

  return (
    <section className={ui.card} aria-labelledby="report-title">
      <div>
        <h2 id="report-title" className={ui.cardTitle}>
          {t("success.upload")}
        </h2>
        <p className={ui.help}>{t("success.uploadHelp", { month: monthLabel(i18n, period) })}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) void open(picked);
        }}
      />
      <div>
        <Button variant={file ? "secondary" : "primary"} onClick={() => input.current?.click()} loading={busy && !file}>
          <FileUp size={16} aria-hidden="true" />
          {t("success.upload")}
        </Button>
      </div>
      {error && <Alert tone="danger" title={error} />}
      {file && plan && (
        <div className={ui.stack}>
          <div className={ui.row}>
            {file.sheets.length > 1 && (
              <Select label={t("check.sheet")} value={plan.sheet} onValueChange={(name) => setPlan({ sheet: name, headerRow: 0, columns: {} })} options={file.sheets.map((s) => ({ value: s.name, label: s.name }))} />
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
          </div>
          <div className={ui.row}>
            {FIELDS.map((f) => (
              <Select key={f} label={t(`success.field.${f}`)} value={plan.columns[f] === undefined ? "none" : String(plan.columns[f])} onValueChange={(v) => setColumn(f, v)} options={options} />
            ))}
          </div>
          {read && read.rows.length > 0 ? (
            <>
              <p className={ui.help}>{t("success.preview", { rows: read.rows.length, skipped: read.skipped.length })}</p>
              <ul className={ui.list}>
                {read.rows.slice(0, 5).map((r) => (
                  <li key={r.row}>
                    <span>{[r.extId, r.name, r.outlet].filter(Boolean).join(" · ")}</span>
                    <span>{pct(r.rateBp)}</span>
                  </li>
                ))}
              </ul>
              <div>
                <Button onClick={save} loading={busy}>
                  {t("success.import", { rows: read.rows.length })}
                </Button>
              </div>
            </>
          ) : (
            <Alert tone="warning" title={t("success.err.columns")} />
          )}
        </div>
      )}
    </section>
  );
}

/** Type in a rate for someone the report left out, or correct one. */
function AddRate({ period, ids }: { period: number; ids: IdOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [extId, setExtId] = useState("");
  const [rate, setRate] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <section className={ui.card} aria-labelledby="add-rate-title">
      <h2 id="add-rate-title" className={ui.cardTitle}>
        {t("success.add")}
      </h2>
      <div className={ui.row}>
        <Combobox
          label={t("success.who")}
          options={ids.map((o) => ({ value: o.extId, label: idLabel(o), keywords: [o.extId, o.outlet] }))}
          value={extId}
          onValueChange={setExtId}
          placeholder={t("penalties.pick")}
          emptyMessage={t("penalties.noPeople")}
          clearLabel={t("common.clear")}
        />
        <label className={ui.field}>
          <span className={ui.label}>{t("success.rate")}</span>
          <DecimalInput value={rate} onValueChange={setRate} label={t("success.rate")} />
        </label>
      </div>
      <div>
        <Button
          loading={busy}
          disabled={!extId || rate < 0 || rate > 100}
          onClick={async () => {
            setBusy(true);
            const r = await setSuccessRate({ period, extId, rate });
            setBusy(false);
            if (!r.ok) return toast.error(t(r.error, r.vars));
            toast.success(t("success.saved"));
            setExtId("");
            router.refresh();
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </section>
  );
}

/** The month's success rates: J&T's report (or typed in), who's still missing, and corrections. */
export function SuccessRates({ data }: { data: SuccessMonth }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const month = monthLabel(i18n, data.period);

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("success.title", { month })}</h1>
          <p className={ui.subtitle}>{t("success.subtitle")}</p>
        </div>
      </header>

      <ReportUpload period={data.period} />

      {data.missing.length > 0 && (
        <Alert tone="warning" title={t("success.missing", { count: data.missing.length, month })}>
          {data.missing.slice(0, 12).map(idLabel).join(", ") + (data.missing.length > 12 ? " …" : "")}
        </Alert>
      )}

      <section className={ui.card} aria-labelledby="rates-title">
        <h2 id="rates-title" className={ui.cardTitle}>
          {t("success.list", { count: data.rates.length })}
        </h2>
        {data.rates.length === 0 ? (
          <EmptyState title={t("success.emptyTitle", { month })} description={t("success.emptyBody")} />
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">{t("run.col.id")}</th>
                  <th scope="col">{t("run.col.name")}</th>
                  <th scope="col">{t("runs.outlet")}</th>
                  <th scope="col" data-numeric>
                    {t("success.rate")}
                  </th>
                  <th scope="col" data-numeric>
                    {t("success.counts")}
                  </th>
                  <th scope="col">{t("success.source")}</th>
                  <th scope="col" aria-label={t("common.delete")} />
                </tr>
              </thead>
              <tbody>
                {data.rates.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.extId}</th>
                    <td data-label={t("run.col.name")}>{r.dispatcher?.name ?? <span className={table.warn}>{r.name ? t("success.noDispatcher", { name: r.name }) : t("success.unknownId")}</span>}</td>
                    <td data-label={t("runs.outlet")}>{r.outlet ?? "—"}</td>
                    <td data-label={t("success.rate")} data-numeric>{pct(r.rateBp)}</td>
                    <td data-label={t("success.counts")} data-numeric>{r.delivered !== null && r.total !== null ? `${i18n.number(r.delivered)} / ${i18n.number(r.total)}` : "—"}</td>
                    <td data-label={t("success.source")}>{r.fileName ?? t("success.typed", { actor: r.actor ?? "—" })}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("success.remove", { id: r.extId })}
                        onClick={async () => {
                          const res = await deleteSuccessRate({ id: r.id });
                          if (!res.ok) return toast.error(t(res.error, res.vars));
                          router.refresh();
                        }}
                      >
                        <X size={16} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AddRate period={data.period} ids={data.ids} />
    </div>
  );
}
