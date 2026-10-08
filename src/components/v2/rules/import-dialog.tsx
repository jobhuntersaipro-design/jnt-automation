"use client";

import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Select } from "@/components/arc/select/select";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import type { RuleConfig } from "@/lib/v2/pay/config";
import { findHeader, guessMapping, isHeaderRow, MAX_FILE_BYTES, rowsToConfig, type Field, type ImportIssue, type Mapping } from "@/lib/v2/pay/rate-card-io";
import type { Sheet } from "@/lib/v2/pay/sheet";
import { readRateCardFile } from "@/lib/v2/rules/actions";
import ui from "../ui.module.css";
import styles from "./rules.module.css";

const SHOWN_FIELDS: Field[] = ["weightFrom", "weightTo", "tierFrom", "tierTo", "bike", "car", "lorry", "rate"];
const MAX_ISSUES = 8;
const columnLetter = (i: number) => (i < 26 ? "" : "A") + String.fromCharCode(65 + (i % 26));

interface Props {
  /** Supplies what a sheet doesn't say: what is counted, the tier basis, per parcel or flat. */
  base: RuleConfig;
  onImport: (config: RuleConfig, fileName: string) => void;
  /** Downloads the current rates, which is also the file format to fill in. */
  onTemplate: () => void;
}

/** Spreadsheet → editor draft. Nothing is saved here: the rates land in the editor to check and save. */
export function ImportDialog({ base, onImport, onTemplate }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [file, setFile] = useState<{ name: string; sheets: Sheet[] } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);

  const rows = file?.sheets[sheetIndex]?.rows ?? [];
  const header = findHeader(rows);
  const headers = rows[header] ?? [];
  const result = file && mapping ? rowsToConfig(rows.slice(header + 1), mapping, base, header + 2) : null;

  function pickSheet(sheets: Sheet[], index: number) {
    const sheetRows = sheets[index]?.rows ?? [];
    setSheetIndex(index);
    setMapping(guessMapping(sheetRows[findHeader(sheetRows)] ?? []));
  }

  async function read(picked: File) {
    setError(null);
    setFile(null);
    if (picked.size > MAX_FILE_BYTES) return setError("import.err.tooBig");
    setReading(true);
    const form = new FormData();
    form.set("file", picked);
    const r = await readRateCardFile(form).catch(() => null);
    setReading(false);
    if (!r?.ok) return setError(r?.error ?? "import.err.unreadable");
    setFile(r.data);
    // The first sheet with a rate table, so a notes sheet in front doesn't get in the way.
    pickSheet(r.data.sheets, Math.max(0, r.data.sheets.findIndex((sheet) => sheet.rows.slice(0, 20).some(isHeaderRow))));
  }

  function say(issue: ImportIssue) {
    const vars = Object.fromEntries(Object.entries(issue.vars ?? {}).map(([k, v]) => [k, typeof v === "number" ? i18n.number(v) : v]));
    const message = t(issue.key, vars);
    return issue.row === null ? message : t("import.atRow", { row: issue.row, message });
  }

  function issueAlert(tone: "danger" | "warning", title: string, issues: ImportIssue[]) {
    return (
      <Alert tone={tone} title={title}>
        {issues.slice(0, MAX_ISSUES).map((issue, i) => (
          <span key={i} className={styles.issueLine}>
            {say(issue)}
          </span>
        ))}
        {issues.length > MAX_ISSUES && <span className={styles.issueLine}>{t("import.more", { count: issues.length - MAX_ISSUES })}</span>}
      </Alert>
    );
  }

  const config = result?.config ?? null;
  const summary = config
    ? [
        config.tiers.length > 1 ? i18n.tp("rules.tierCount", config.tiers.length, { basis: t(`basis.${config.basis}`) }) : null,
        i18n.tp("rules.bandCount", config.bands.length),
        config.byVehicle ? t("rules.byVehicle") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFile(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <FileUp size={16} aria-hidden="true" />
          {t("import.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className={styles.wideDialog} title={t("import.title")} description={t("import.help")} closeLabel={t("common.close")}>
        <div className={ui.stack}>
          <div className={ui.row}>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              hidden
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = ""; // the same file can be chosen again after fixing it
                if (picked) void read(picked);
              }}
            />
            <Button onClick={() => input.current?.click()} loading={reading}>
              {t(reading ? "import.reading" : "import.choose")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onTemplate}>
              <Download size={16} aria-hidden="true" />
              {t("import.template")}
            </Button>
          </div>
          {error && <Alert tone="danger" title={t(error)} />}

          {file && (
            <>
              <p className={styles.fileName}>{file.name}</p>
              {file.sheets.length > 1 && (
                <div className={styles.options}>
                  <Select
                    label={t("import.sheet")}
                    value={String(sheetIndex)}
                    onValueChange={(v) => pickSheet(file.sheets, Number(v))}
                    options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                  />
                </div>
              )}
              <section className={ui.stack} aria-labelledby="import-columns">
                <div>
                  <h3 id="import-columns" className={ui.sectionTitle}>
                    {t("import.columns")}
                  </h3>
                  <p className={ui.help}>{t("import.headerRow", { row: header + 1 })}</p>
                </div>
                <div className={styles.options}>
                  {mapping &&
                    SHOWN_FIELDS.map((field) => (
                      <Select
                        key={field}
                        label={t(`import.col.${field}`)}
                        value={String(mapping[field])}
                        onValueChange={(v) => setMapping({ ...mapping, [field]: Number(v) })}
                        options={[
                          { value: "-1", label: t("import.notInFile") },
                          ...headers.map((name, i) => ({ value: String(i), label: t("import.column", { letter: columnLetter(i), name: name || "—" }) })),
                        ]}
                      />
                    ))}
                </div>
              </section>
              {result && result.errors.length > 0 && issueAlert("danger", t("import.errorsTitle"), result.errors)}
              {config && result && result.warnings.length > 0 && issueAlert("warning", t("import.warningsTitle"), result.warnings)}
              {config && <p className={styles.ready}>{t("import.ready", { summary })}</p>}
              <div>
                <Button
                  disabled={!config}
                  onClick={() => {
                    if (!config) return;
                    onImport(config, file.name);
                    setOpen(false);
                    setFile(null);
                  }}
                >
                  {t("import.use")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
