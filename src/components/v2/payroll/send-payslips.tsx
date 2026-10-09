"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { useI18n } from "@/components/v2/i18n-provider";
import { whatsappLink } from "@/lib/billing";
import type { Period } from "@/lib/v2/pay/resolve";
import { setPhone } from "@/lib/v2/people/actions";
import { monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./payroll.module.css";

interface Row {
  id: string;
  dispatcherId: string;
  name: string;
  extId: string;
  netCents: number;
  phone: string | null;
  link: string;
  message: string;
}

/** One line per dispatcher: their mobile number, a WhatsApp message with their payslip link, or the link to copy. */
export function SendPayslips({ run, rows }: { run: { id: string; outlet: string; period: Period; final: boolean }; rows: Row[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [phones, setPhones] = useState(() => new Map(rows.map((r) => [r.dispatcherId, r.phone ?? ""])));
  const withPhone = rows.filter((r) => phones.get(r.dispatcherId)).length;

  async function save(dispatcherId: string, value: string) {
    const r = await setPhone({ dispatcherId, phone: value });
    if (!r.ok) return toast.error(t(r.error, r.vars));
    setPhones((m) => new Map(m).set(dispatcherId, r.data.phone ?? ""));
  }

  async function copy(link: string) {
    await navigator.clipboard.writeText(link).catch(() => null);
    toast.success(t("send.copied"));
  }

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href={`/app/payroll/${run.id}`} className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("run.title", { outlet: run.outlet, month: monthLabel(i18n, run.period) })}
          </Link>
          <h1 className={ui.title}>{t("send.title")}</h1>
          <p className={ui.subtitle}>{t("send.subtitle")}</p>
        </div>
      </header>

      {!run.final ? (
        <Alert tone="info" title={t("send.notFinal")} />
      ) : (
        <>
          <p className={ui.help}>{t("send.count", { with: withPhone, total: rows.length })}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t("run.col.name")}</th>
                  <th scope="col">{t("run.col.id")}</th>
                  <th scope="col" data-numeric>
                    {t("run.col.net")}
                  </th>
                  <th scope="col">{t("send.phone")}</th>
                  <th scope="col">{t("send.send")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const phone = phones.get(r.dispatcherId) ?? "";
                  return (
                    <tr key={r.id}>
                      <th scope="row">{r.name}</th>
                      <td>{r.extId}</td>
                      <td data-numeric>{i18n.money(r.netCents / 100)}</td>
                      <td>
                        <input
                          className={ui.input}
                          type="tel"
                          inputMode="tel"
                          defaultValue={phone}
                          placeholder="012-345 6789"
                          aria-label={t("send.phoneFor", { name: r.name })}
                          onBlur={(e) => e.target.value.trim() !== phone && void save(r.dispatcherId, e.target.value)}
                        />
                      </td>
                      <td>
                        <span className={ui.row}>
                          {phone ? (
                            <a className={`${ui.link} ${styles.action}`} href={`${whatsappLink(phone)}?text=${encodeURIComponent(r.message)}`} target="_blank" rel="noreferrer">
                              <MessageCircle size={16} aria-hidden="true" /> {t("send.whatsapp")}
                            </a>
                          ) : (
                            <span className={ui.help}>{t("send.noPhone")}</span>
                          )}
                          <button type="button" className={`${ui.link} ${styles.action}`} onClick={() => copy(r.link)}>
                            <Link2 size={16} aria-hidden="true" /> {t("send.copy")}
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
