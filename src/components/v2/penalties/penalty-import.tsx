"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { Switch } from "@/components/arc/switch/switch";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import { PENALTY_TYPES, type PenaltyType } from "@/lib/v2/pay/config";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { FIELDS, hasIdentity, matchColumns, mostCommonPeriod, planSheet, readPenalties, type Field, type PenaltyRow, type SheetPlan } from "@/lib/v2/penalties/parse";
import type { ImportSummary } from "@/lib/v2/penalties/store";
import { monthLabel, penaltyLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./penalties.module.css";

type Failure = { error: MessageKey; vars?: Record<string, string | number> };

async function post<T>(form: FormData): Promise<T | Failure> {
  const res = await fetch("/api/v2/penalties", { method: "POST", body: form }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as T | Failure | null;
  if (!res?.ok || !body) return body && "error" in (body as object) ? (body as Failure) : { error: "penalty.err.unreadable" };
  return body;
}

const isFailure = (x: unknown): x is Failure => typeof x === "object" && x !== null && "error" in x;
const columnLetter = (c: number) => (c < 26 ? "" : String.fromCharCode(64 + Math.floor(c / 26))) + String.fromCharCode(65 + (c % 26));
const SAMPLE = 3;

/** Upload a QC file, check how each sheet is read, then import its cases into a month. */
export function PenaltyImport({ defaultPeriod }: { defaultPeriod: Period }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ file: File; name: string; sheets: Sheet[] } | null>(null);
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [month, setMonth] = useState(periodToInput(defaultPeriod));
  const [filePeriod, setFilePeriod] = useState<Period | null>(null);
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => (file ? readPenalties(file.sheets, plans) : []), [file, plans]);
  const problems = plans
    .filter((p) => !p.skip)
    .flatMap((p) => (!p.type ? [t("penalties.err.needType", { sheet: p.sheet })] : !hasIdentity(p.columns) ? [t("penalties.err.needIdentity", { sheet: p.sheet })] : []));
  if (file && plans.every((p) => p.skip)) problems.push(t("penalties.err.nothing"));

  async function read(picked: File) {
    setError(null);
    setBusy("reading");
    const form = new FormData();
    form.set("file", picked);
    const body = await post<{ fileName: string; sheets: Sheet[] }>(form);
    setBusy(null);
    if (isFailure(body)) return setError(t(body.error, body.vars));
    const planned = body.sheets.map((s) => planSheet(s, body.fileName));
    const period = mostCommonPeriod(readPenalties(body.sheets, planned));
    setFile({ file: picked, name: body.fileName, sheets: body.sheets });
    setPlans(planned);
    setFilePeriod(period);
    setMonth(periodToInput(period ?? defaultPeriod));
  }

  async function save() {
    const period = periodFromInput(month);
    if (!file || !period || problems.length > 0) return;
    setBusy("importing");
    const form = new FormData();
    form.set("file", file.file);
    form.set("plan", JSON.stringify({ period, sheets: plans }));
    const body = await post<ImportSummary>(form);
    setBusy(null);
    if (isFailure(body)) return setError(t(body.error, body.vars));
    const unmatched = body.unmatched > 0 ? ` ${tp("penalties.importedUnmatched", body.unmatched)}` : "";
    toast.success(t("penalties.imported", { added: body.added, updated: body.updated, unchanged: body.unchanged }) + unmatched);
    setFile(null);
    setPlans([]);
    router.push(`/app/penalties?month=${period}`);
    router.refresh();
  }

  const update = (i: number, patch: Partial<SheetPlan>) => setPlans((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <section className={ui.card} aria-labelledby="penalty-import-title">
      <div>
        <h2 id="penalty-import-title" className={ui.cardTitle}>
          {t("penalties.import")}
        </h2>
        <p className={ui.help}>{t("penalties.importHelp")}</p>
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
        <Button variant={file ? "secondary" : "primary"} onClick={() => input.current?.click()} loading={busy === "reading"}>
          <FileUp size={16} aria-hidden="true" />
          {t("penalties.import")}
        </Button>
      </div>
      {busy === "reading" && (
        <p className={ui.help} role="status">
          {t("penalties.reading")}
        </p>
      )}
      {error && <Alert tone="danger" title={error} />}

      {file && (
        <div className={ui.stack}>
          <h3 className={ui.sectionTitle}>{t("penalties.preview")}</h3>
          <p className={ui.muted}>{file.name}</p>
          <label className={ui.field}>
            <span className={ui.label}>{t("penalties.importTo")}</span>
            <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} />
            {filePeriod && <span className={ui.help}>{t("penalties.fromFile", { month: monthLabel(i18n, filePeriod) })}</span>}
          </label>
          <div className={styles.sheets}>
            {plans.map((plan, i) => (
              <SheetSettings
                key={plan.sheet}
                sheet={file.sheets.find((s) => s.name === plan.sheet)!}
                plan={plan}
                rows={rows.filter((r) => r.sheet === plan.sheet)}
                onChange={(patch) => update(i, patch)}
              />
            ))}
          </div>
          {problems.length > 0 && <Alert tone="warning" title={problems.join(" ")} />}
          <div className={ui.row}>
            <Button onClick={save} loading={busy === "importing"} disabled={problems.length > 0 || rows.length === 0}>
              {tp("penalties.importCount", rows.length)}
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

function SheetSettings({ sheet, plan, rows, onChange }: { sheet: Sheet; plan: SheetPlan; rows: PenaltyRow[]; onChange: (patch: Partial<SheetPlan>) => void }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const header = sheet.rows[plan.headerRow] ?? [];
  const width = Math.max(header.length, ...sheet.rows.slice(plan.headerRow + 1, plan.headerRow + 20).map((r) => r.length));
  const columnOptions = [
    { value: "none", label: t("penalties.notUsed") },
    ...Array.from({ length: width }, (_, c) => ({ value: String(c), label: t("penalties.column", { letter: columnLetter(c), header: header[c] || "—" }) })),
  ];
  const setColumn = (field: Field, value: string) => {
    const columns = { ...plan.columns };
    if (value === "none") delete columns[field];
    else columns[field] = Number(value);
    onChange({ columns });
  };

  return (
    <section className={styles.sheet} aria-label={t("penalties.sheet", { name: plan.sheet })}>
      <div className={styles.sheetHead}>
        <div>
          <strong>{t("penalties.sheet", { name: plan.sheet })}</strong>
          {!plan.skip && <p className={ui.help}>{tp("penalties.sheetCases", rows.length)}</p>}
        </div>
        <Switch label={t("penalties.include")} checked={!plan.skip} onCheckedChange={(on) => onChange({ skip: !on })} />
      </div>
      {!plan.skip && (
        <>
          {!hasIdentity(plan.columns) && <p className={ui.help}>{t("penalties.noTable")}</p>}
          <div className={styles.options}>
            <Select
              label={t("penalties.type")}
              placeholder={t("penalties.chooseType")}
              value={plan.type ?? ""}
              onValueChange={(v) => onChange({ type: v as PenaltyType })}
              options={PENALTY_TYPES.map((p) => ({ value: p, label: penaltyLabel(i18n, p) }))}
            />
            <label className={ui.field}>
              <span className={ui.label}>{t("penalties.headerRow")}</span>
              <input
                type="number"
                className={ui.input}
                min={1}
                max={sheet.rows.length}
                value={plan.headerRow + 1}
                onChange={(e) => {
                  const headerRow = Math.min(Math.max(Math.floor(Number(e.target.value)) - 1, 0), sheet.rows.length - 1);
                  if (Number.isFinite(headerRow)) onChange({ headerRow, columns: matchColumns(sheet.rows[headerRow] ?? []) });
                }}
              />
            </label>
          </div>
          <details className={styles.columns}>
            <summary>{t("penalties.columns")}</summary>
            <div className={styles.options}>
              {FIELDS.map((f) => (
                <Select
                  key={f}
                  label={t(`penalties.field.${f}`)}
                  value={plan.columns[f] === undefined ? "none" : String(plan.columns[f])}
                  onValueChange={(v) => setColumn(f, v)}
                  options={columnOptions}
                />
              ))}
            </div>
          </details>
          {rows.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {(["date", "waybill", "extId", "name", "amount"] as const).map((f) => (
                      <th key={f} scope="col" data-numeric={f === "amount" ? true : undefined}>
                        {t(`penalties.field.${f}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, SAMPLE).map((r) => (
                    <tr key={r.key}>
                      <td>{r.occurredAt?.slice(0, 10) ?? "—"}</td>
                      <td>{r.waybill ?? "—"}</td>
                      <td>{r.extId ?? "—"}</td>
                      <td>{r.name ?? "—"}</td>
                      <td data-numeric>{r.amountCents === null ? "—" : i18n.money(r.amountCents / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
