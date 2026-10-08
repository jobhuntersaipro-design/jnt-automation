"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { Select } from "@/components/arc/select/select";
import { useI18n } from "@/components/v2/i18n-provider";
import { KINDS, type Kind } from "@/lib/v2/pay/config";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import { createRule } from "@/lib/v2/rules/actions";
import type { RuleView } from "@/lib/v2/rules/data";
import { configSummary, monthLabel, scopeLabel } from "./labels";
import ui from "../ui.module.css";
import styles from "./rules.module.css";

export function RulesList({ rules, thisMonth }: { rules: RuleView[]; thisMonth: Period }) {
  const i18n = useI18n();
  const { t } = i18n;
  const kinds = KINDS.filter((k) => rules.some((r) => r.kind === k));

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("rules.title")}</h1>
          <p className={ui.subtitle}>{t("rules.subtitle")}</p>
        </div>
        <NewRuleDialog thisMonth={thisMonth} />
      </header>

      {rules.length === 0 && (
        <EmptyState title={t("rules.emptyTitle")} description={t("rules.emptyBody")} action={<NewRuleDialog thisMonth={thisMonth} kind="PARCEL" />} />
      )}

      {kinds.map((kind) => (
        <section key={kind} className={ui.stack} aria-labelledby={`kind-${kind}`}>
          <div>
            <h2 id={`kind-${kind}`} className={ui.cardTitle}>
              {t(`kind.${kind}`)}
            </h2>
            <p className={ui.help}>{t(`kind.${kind}.help`)}</p>
          </div>
          <div className={ui.grid}>
            {rules
              .filter((r) => r.kind === kind)
              .map((rule) => (
                <Link key={rule.id} href={`/app/rules/${rule.id}`} className={styles.ruleCard}>
                  <span className={styles.ruleName}>{rule.name}</span>
                  <span className={ui.help}>{t("rules.fromMonth", { month: monthLabel(i18n, rule.versions[0].effectiveFrom) })}</span>
                  <span className={ui.row}>
                    {configSummary(i18n, rule.versions[0].config).map((fact) => (
                      <Badge key={fact} size="sm">
                        {fact}
                      </Badge>
                    ))}
                  </span>
                  <span className={ui.row}>
                    {rule.assignments.length === 0 ? (
                      <Badge size="sm" tone="warning">
                        {t("rules.notApplied")}
                      </Badge>
                    ) : (
                      rule.assignments.map((a) => (
                        <Badge key={a.id} size="sm" tone="info">
                          {scopeLabel(i18n, a)}
                        </Badge>
                      ))
                    )}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NewRuleDialog({ thisMonth, kind: initialKind }: { thisMonth: Period; kind?: Kind }) {
  const { t } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind ?? "PARCEL");
  const [name, setName] = useState("");
  const [month, setMonth] = useState(periodToInput(thisMonth));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const effectiveFrom = periodFromInput(month);
    if (!name.trim() || !effectiveFrom) return setError(t("error.invalid"));
    setPending(true);
    const result = await createRule({ kind, name, effectiveFrom });
    setPending(false);
    if (!result.ok) return setError(t(result.error));
    router.push(`/app/rules/${result.data.id}`);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>{initialKind ? t("rules.emptyAction") : t("rules.new")}</Button>
      </DialogTrigger>
      <DialogContent title={t("rules.newTitle")} description={t("rules.newHelp")} closeLabel={t("common.close")}>
        <form className={ui.stack} onSubmit={create}>
          <Select
            label={t("rules.kind")}
            value={kind}
            onValueChange={(v) => setKind(v as Kind)}
            description={t(`kind.${kind}.help`)}
            options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
          <Input label={t("rules.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          <label className={ui.field}>
            <span className={ui.label}>{t("rules.from")}</span>
            <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} required />
          </label>
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={pending}>
            {t("rules.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
