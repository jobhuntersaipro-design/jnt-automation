"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { DecimalInput } from "@/components/v2/decimal-input";
import { useI18n } from "@/components/v2/i18n-provider";
import { personOptions } from "@/components/v2/penalties/penalties";
import { addAdvance, deleteAdvance } from "@/lib/v2/advances/actions";
import type { AdvanceView, Carried } from "@/lib/v2/advances/data";
import type { PersonOption } from "@/lib/v2/penalties/data";
import type { Period } from "@/lib/v2/pay/resolve";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "../payroll/payroll.module.css";

/** Advances given in the sidebar's month, and what's carried in from earlier months. */
export function Advances({ data, people }: { data: { period: Period; advances: AdvanceView[]; carried: Carried[] }; people: PersonOption[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const month = monthLabel(i18n, data.period);
  const [dispatcherId, setDispatcherId] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const total = data.advances.reduce((n, a) => n + a.amountCents, 0);

  async function add() {
    setSaving(true);
    const r = await addAdvance({ dispatcherId, period: data.period, amountCents: Math.round(amount * 100), note });
    setSaving(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    const name = people.find((p) => p.id === dispatcherId)?.name ?? "";
    toast.success(t("advance.added", { name, amount: i18n.money(amount), month }));
    setDispatcherId("");
    setAmount(0);
    setNote("");
    router.refresh();
  }

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("advance.title", { month })}</h1>
          <p className={ui.subtitle}>{t("advance.subtitle")}</p>
        </div>
      </header>

      <section className={ui.card} aria-labelledby="advance-add">
        <h2 id="advance-add" className={ui.cardTitle}>
          {t("advance.add")}
        </h2>
        <div className={styles.inline}>
          <Combobox
            label={t("advance.who")}
            options={personOptions(people)}
            value={dispatcherId}
            onValueChange={setDispatcherId}
            placeholder={t("penalties.pick")}
            emptyMessage={t("penalties.noPeople")}
            clearLabel={t("common.clear")}
          />
          <label className={ui.field}>
            <span className={ui.label}>{t("advance.amount")}</span>
            <DecimalInput value={amount} onValueChange={setAmount} label={t("advance.amount")} />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>{t("advance.note")}</span>
            <input className={ui.input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button onClick={add} loading={saving} disabled={!dispatcherId || amount <= 0}>
            {t("advance.addButton")}
          </Button>
        </div>
      </section>

      {data.advances.length === 0 ? (
        <EmptyState title={t("advance.emptyTitle", { month })} description={t("advance.emptyBody")} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("run.col.name")}</th>
                <th scope="col" data-numeric>
                  {t("advance.amount")}
                </th>
                <th scope="col">{t("advance.note")}</th>
                <th scope="col">{t("dispatchers.history.col.by")}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.advances.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.name}</th>
                  <td data-label={t("advance.amount")} data-numeric>{i18n.money(a.amountCents / 100)}</td>
                  <td data-label={t("advance.note")}>{a.note ?? "—"}</td>
                  <td data-label={t("dispatchers.history.col.by")}>{`${a.createdBy ?? "—"} · ${i18n.date(new Date(a.createdAt))}`}</td>
                  <td>
                    {a.locked ? (
                      <span className={ui.help}>{t("advance.locked")}</span>
                    ) : (
                      <ConfirmButton
                        variant="ghost"
                        confirmVariant="danger"
                        label={t("common.delete")}
                        prompt={t("advance.deletePrompt", { name: a.name, amount: i18n.money(a.amountCents / 100) })}
                        confirmLabel={t("common.delete")}
                        onConfirm={async () => {
                          const r = await deleteAdvance({ id: a.id });
                          if (!r.ok) {
                            toast.error(t(r.error, r.vars));
                            throw new Error(r.error);
                          }
                          router.refresh();
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("common.total")}</th>
                <td data-label={t("advance.amount")} data-numeric>{i18n.money(total / 100)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data.carried.length > 0 && (
        <section className={ui.card} aria-labelledby="advance-carried">
          <div>
            <h2 id="advance-carried" className={ui.cardTitle}>
              {t("advance.carried")}
            </h2>
            <p className={ui.help}>{t("advance.carriedHelp", { month })}</p>
          </div>
          <ul className={ui.list}>
            {data.carried.map((c) => (
              <li key={c.dispatcherId}>{`${c.name}: ${i18n.money(c.cents / 100)}`}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
