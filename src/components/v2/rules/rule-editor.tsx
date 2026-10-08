"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ConfirmMorph } from "@/components/arc/confirm-morph/confirm-morph";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import { downloadCsv } from "@/components/v2/download";
import { useI18n } from "@/components/v2/i18n-provider";
import type { MessageKey } from "@/lib/i18n/en";
import { configProblems, type RuleConfig } from "@/lib/v2/pay/config";
import { configToRows, FIELDS, toCsv, type Field } from "@/lib/v2/pay/rate-card-io";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import { archiveRule, copyRule, deleteVersion, renameRule, saveVersion } from "@/lib/v2/rules/actions";
import type { AuditView, RuleView, VersionView } from "@/lib/v2/rules/data";
import { AppliesTo } from "./applies-to";
import { ConfigEditor } from "./config-editor";
import { History } from "./history";
import { ImportDialog } from "./import-dialog";
import { monthLabel } from "./labels";
import { Simulator } from "./simulator";
import ui from "../ui.module.css";
import styles from "./rules.module.css";

interface Props {
  rule: RuleView;
  version: VersionView;
  outlets: { id: string; code: string }[];
  dispatchers: { id: string; name: string; extId: string }[];
  audit: AuditView[];
  thisMonth: Period;
}

/** One rule: pick a version, edit its numbers, save them from a month on. */
export function RuleEditor({ rule, version, outlets, dispatchers, audit, thisMonth }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [draft, setDraft] = useState<RuleConfig>(version.config);
  const [month, setMonth] = useState(periodToInput(Math.max(thisMonth, version.effectiveFrom)));
  const [saving, setSaving] = useState(false);
  const [replaceMonth, setReplaceMonth] = useState<Period | null>(null);
  /** Set when the draft came from a file, for the audit log. */
  const [source, setSource] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(version.config);
  const problems = configProblems(draft);
  const effectiveFrom = periodFromInput(month);
  const go = (p: Period) => router.replace(`/app/rules/${rule.id}?month=${p}`, { scroll: false });

  async function save(replace: boolean) {
    if (!effectiveFrom || problems.length > 0) return;
    if (!replace && rule.versions.some((v) => v.effectiveFrom === effectiveFrom)) return setReplaceMonth(effectiveFrom);
    setSaving(true);
    const result = await saveVersion({ ruleId: rule.id, effectiveFrom, config: draft, replace, source: source ?? undefined });
    setSaving(false);
    setReplaceMonth(null);
    if (!result.ok) return toast.error(t(result.error));
    toast.success(t("rule.saved", { month: monthLabel(i18n, effectiveFrom) }));
    go(effectiveFrom);
  }

  function exportCsv() {
    const headers = Object.fromEntries(FIELDS.map((f) => [f, t(`import.col.${f}`)])) as Record<Field, string>;
    const name = rule.name.replace(/[\\/:*?"<>|]+/g, "-");
    downloadCsv(`${name} ${periodToInput(version.effectiveFrom)}.csv`, toCsv(configToRows(draft, headers)));
  }

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href="/app/rules" className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("rule.back")}
          </Link>
          <div className={ui.row}>
            <h1 className={ui.title}>{rule.name}</h1>
            <Badge tone="info">{t(`kind.${rule.kind}`)}</Badge>
          </div>
        </div>
        <div className={ui.row}>
          <NameDialog
            trigger={t("rule.rename")}
            title={t("rule.rename")}
            initial={rule.name}
            submit={t("common.save")}
            onSubmit={async (name) => {
              const r = await renameRule({ ruleId: rule.id, name });
              if (r.ok) router.refresh();
              return r;
            }}
          />
          <NameDialog
            trigger={t("rule.copy")}
            title={t("rule.copyTitle")}
            help={t("rule.copyHelp")}
            initial={t("rule.copyName", { name: rule.name })}
            submit={t("rule.copy")}
            onSubmit={async (name) => {
              const r = await copyRule({ ruleId: rule.id, name });
              if (r.ok) router.push(`/app/rules/${r.data.id}`);
              return r;
            }}
          />
          <ConfirmMorph
            label={t("rule.archive")}
            prompt={t("rule.archivePrompt")}
            confirmLabel={t("rule.archive")}
            cancelLabel={t("common.cancel")}
            pendingLabel={t("common.loading")}
            doneLabel={t("rule.archived")}
            errorLabel={t("common.failed")}
            retryLabel={t("common.retry")}
            onConfirm={async () => {
              const r = await archiveRule({ ruleId: rule.id });
              if (!r.ok) throw new Error(r.error);
              router.push("/app/rules");
            }}
          />
        </div>
      </header>

      <nav className={ui.stack} aria-label={t("rule.versions")}>
        <h2 className={ui.sectionTitle}>{t("rule.versions")}</h2>
        <div className={styles.versions}>
          {rule.versions.map((v) => (
            <button
              key={v.id}
              type="button"
              className={styles.versionChip}
              aria-pressed={v.id === version.id}
              disabled={dirty && v.id !== version.id}
              onClick={() => go(v.effectiveFrom)}
            >
              {t("rules.fromMonth", { month: monthLabel(i18n, v.effectiveFrom) })}
            </button>
          ))}
        </div>
        {dirty && <p className={ui.help}>{t("rule.unsavedHint")}</p>}
      </nav>

      <div className={styles.layout}>
        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="editor-title">
            <div className={styles.cardHead}>
              <div>
                <h2 id="editor-title" className={ui.cardTitle}>
                  {t("rule.editing", { month: monthLabel(i18n, version.effectiveFrom) })}
                </h2>
                <p className={ui.help}>{t("rule.editingHelp")}</p>
              </div>
              <div className={ui.row}>
                <ImportDialog
                  base={draft}
                  onTemplate={exportCsv}
                  onImport={(config, fileName) => {
                    setDraft(config);
                    setSource(`import:${fileName}`);
                    toast.success(t("import.done", { file: fileName }));
                  }}
                />
                <Button variant="secondary" size="sm" onClick={exportCsv}>
                  <Download size={16} aria-hidden="true" />
                  {t("export.button")}
                </Button>
              </div>
            </div>
            <ConfigEditor config={draft} onChange={setDraft} />
            {problems.length > 0 && (
              <Alert tone="warning" title={t("rule.problems")}>
                {problems.map((p) => t(p.key, p.vars)).join(" ")}
              </Alert>
            )}
            <div className={styles.saveBar}>
              <label className={ui.field}>
                <span className={ui.label}>{t("rule.saveFrom")}</span>
                <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={!effectiveFrom || undefined} />
              </label>
              <Button onClick={() => save(false)} loading={saving} disabled={problems.length > 0 || !effectiveFrom || (!dirty && effectiveFrom === version.effectiveFrom)}>
                {t("rule.save")}
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(version.config);
                    setSource(null);
                  }}
                >
                  {t("rule.discard")}
                </Button>
              )}
              {!dirty && rule.versions.length > 1 && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    const r = await deleteVersion({ versionId: version.id });
                    if (!r.ok) return toast.error(t(r.error));
                    router.replace(`/app/rules/${rule.id}`, { scroll: false });
                  }}
                >
                  {t("rule.deleteVersion")}
                </Button>
              )}
            </div>
          </section>
          <History audit={audit} />
        </div>
        <div className={ui.stack}>
          <Simulator config={draft} />
          <AppliesTo rule={rule} outlets={outlets} dispatchers={dispatchers} thisMonth={thisMonth} />
        </div>
      </div>

      <Dialog open={replaceMonth !== null} onOpenChange={(open) => !open && setReplaceMonth(null)}>
        <DialogContent
          title={t("rule.replaceTitle", { month: replaceMonth ? monthLabel(i18n, replaceMonth) : "" })}
          description={t("rule.replaceBody")}
          closeLabel={t("common.close")}
        >
          <div className={ui.row}>
            <Button onClick={() => save(true)} loading={saving}>
              {t("rule.replace")}
            </Button>
            <Button variant="ghost" onClick={() => setReplaceMonth(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NameDialog({
  trigger,
  title,
  help,
  initial,
  submit,
  onSubmit,
}: {
  trigger: string;
  title: string;
  help?: string;
  initial: string;
  submit: string;
  onSubmit: (name: string) => Promise<{ ok: boolean; error?: MessageKey }>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">{trigger}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={help} closeLabel={t("common.close")}>
        <form
          className={ui.stack}
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const r = await onSubmit(name);
            setPending(false);
            if (!r.ok) return toast.error(t(r.error ?? "error.invalid"));
            setOpen(false);
          }}
        >
          <Input label={t("rules.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          <Button type="submit" loading={pending}>
            {submit}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
