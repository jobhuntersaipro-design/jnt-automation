"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { downloadCsv } from "@/components/v2/download";
import { useI18n } from "@/components/v2/i18n-provider";
import { saveJournalSetup } from "@/lib/v2/accounting/actions";
import type { JournalSetupView } from "@/lib/v2/accounting/data";
import { buildJournal, journalCsv, missingAccounts, SLOTS, xeroCsv, type JournalLine, type JournalRun, type Slot } from "@/lib/v2/accounting/journal";
import { periodToInput, type Period } from "@/lib/v2/pay/resolve";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import table from "../payroll/payroll.module.css";
import styles from "./accounting.module.css";

/** Account codes once, then each month's finalised payroll as a balanced journal to import or hand to the accountant. */
export function JournalExport({ period, setup, runs, drafts }: { period: Period; setup: JournalSetupView; runs: JournalRun[]; drafts: string[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [form, setForm] = useState(setup);
  const [saving, setSaving] = useState(false);
  const month = monthLabel(i18n, period);
  const lines = useMemo(() => buildJournal(runs, form.accounts), [runs, form.accounts]);
  const missing = missingAccounts(lines);
  const used = new Set(lines.map((l) => l.slot));
  const slotLabel = (s: Slot) => t(`journal.slot.${s}`);
  const text = { reference: t("journal.reference", { month: periodToInput(period) }), describe: (l: JournalLine) => `${l.branch} · ${slotLabel(l.slot)}` };
  const debit = lines.reduce((n, l) => n + l.debitCents, 0);
  const credit = lines.reduce((n, l) => n + l.creditCents, 0);
  const setAccount = (slot: Slot, key: "code" | "name", value: string) => setForm({ ...form, accounts: { ...form.accounts, [slot]: { ...form.accounts[slot], [key]: value } } });

  async function save() {
    setSaving(true);
    const r = await saveJournalSetup(form);
    setSaving(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("journal.saved"));
  }

  const file = `Payroll-journal_${periodToInput(period)}`;
  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href="/app/payroll" className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("nav.payroll")}
          </Link>
          <h1 className={ui.title}>{t("journal.title", { month })}</h1>
          <p className={ui.subtitle}>{t("journal.subtitle")}</p>
        </div>
      </header>

      {drafts.length > 0 && <Alert tone="info" title={t("journal.drafts", { branches: drafts.join(", ") })} />}

      <section className={ui.card} aria-labelledby="journal-title">
        <h2 id="journal-title" className={ui.cardTitle}>
          {t("journal.entry")}
        </h2>
        {lines.length === 0 ? (
          <EmptyState title={t("journal.emptyTitle", { month })} description={t("journal.emptyBody")} />
        ) : (
          <>
            <div className={table.tableWrap}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col">{t("runs.outlet")}</th>
                    <th scope="col">{t("journal.account")}</th>
                    <th scope="col">{t("journal.description")}</th>
                    <th scope="col" data-numeric>
                      {t("journal.debit")}
                    </th>
                    <th scope="col" data-numeric>
                      {t("journal.credit")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={`${l.branch}:${l.slot}`}>
                      <td>{l.branch}</td>
                      <td>{l.code ? `${l.code} ${l.name}`.trim() : <span className={styles.warn}>{t("journal.noCode")}</span>}</td>
                      <td>{text.describe(l)}</td>
                      <td data-numeric>{l.debitCents ? i18n.money(l.debitCents / 100) : ""}</td>
                      <td data-numeric>{l.creditCents ? i18n.money(l.creditCents / 100) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t("common.total")}</th>
                    <td />
                    <td />
                    <td data-numeric>{i18n.money(debit / 100)}</td>
                    <td data-numeric>{i18n.money(credit / 100)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {missing.length > 0 && <Alert tone="warning" title={t("journal.missing", { accounts: missing.map(slotLabel).join(", ") })} />}
            <div className={ui.row}>
              <Button disabled={missing.length > 0} onClick={() => downloadCsv(`${file}.csv`, journalCsv(period, lines, text))}>
                <Download size={16} aria-hidden="true" />
                {t("journal.csv")}
              </Button>
              <Button variant="secondary" disabled={missing.length > 0} onClick={() => downloadCsv(`${file}_Xero.csv`, xeroCsv(period, lines, text, form))}>
                <Download size={16} aria-hidden="true" />
                {t("journal.xero")}
              </Button>
            </div>
            <p className={ui.help}>{t("journal.formats")}</p>
          </>
        )}
      </section>

      <section className={ui.card} aria-labelledby="accounts-title">
        <div>
          <h2 id="accounts-title" className={ui.cardTitle}>
            {t("journal.accounts")}
          </h2>
          <p className={ui.help}>{t("journal.accountsHelp")}</p>
        </div>
        <div className={styles.accounts}>
          {SLOTS.map((slot) => (
            <fieldset key={slot} className={styles.slot}>
              <legend className={ui.label}>
                {slotLabel(slot)}
                {used.has(slot) && <span className={ui.help}>{` · ${t("journal.usedThisMonth")}`}</span>}
              </legend>
              <p className={ui.help}>{t(`journal.slotHelp.${slot}`)}</p>
              <div className={styles.pair}>
                <Input label={t("journal.code")} value={form.accounts[slot].code} onChange={(e) => setAccount(slot, "code", e.target.value)} />
                <Input label={t("journal.name")} value={form.accounts[slot].name} onChange={(e) => setAccount(slot, "name", e.target.value)} />
              </div>
            </fieldset>
          ))}
        </div>
        <div className={styles.pair}>
          <Input label={t("journal.taxRate")} description={t("journal.taxRateHelp")} value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
          <Input label={t("journal.tracking")} description={t("journal.trackingHelp")} value={form.tracking} onChange={(e) => setForm({ ...form, tracking: e.target.value })} />
        </div>
        <div>
          <Button onClick={save} loading={saving} disabled={!form.taxRate.trim()}>
            {t("common.save")}
          </Button>
        </div>
      </section>
    </div>
  );
}
