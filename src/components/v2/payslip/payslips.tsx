import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { createI18n, type I18n } from "@/lib/i18n/core";
import type { MessageKey } from "@/lib/i18n/en";
import { messagesFor } from "@/lib/i18n/messages";
import type { RuleConfig } from "@/lib/v2/pay/config";
import { DEDUCTING, type Group } from "@/lib/v2/pay/engine";
import { periodMonth, periodYear } from "@/lib/v2/pay/resolve";
import { ADVANCE, type PayLine, type PenaltyCase } from "@/lib/v2/payroll/calc";
import type { ResultView, RunView } from "@/lib/v2/payroll/data";
import { employmentLabel, penaltyLabel, rangeLabels, vehicleLabel, warningText } from "../labels";
import { PrintButton } from "./print-button";
import ui from "../ui.module.css";
import styles from "./payslip.module.css";

// Payslips are bilingual by default (中文 then English) whatever the UI language; `lang` can narrow them to one.
// Printed from the browser (A4, one dispatcher per page), which also saves them as PDF.

export type SlipLang = "both" | "zh" | "en";
export const SLIP_LANGS: SlipLang[] = ["both", "zh", "en"];

export interface Company {
  name: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
}

const zh = createI18n("zh", messagesFor("zh"));
const en = createI18n("en", messagesFor("en"));

/** The same words in both languages, side by side (once when they're the same, like "KPI"). */
function Both({ text }: { text: (i: I18n) => string }) {
  const [inZh, inEn] = [text(zh), text(en)];
  if (inZh === inEn) return <span>{inEn}</span>;
  return (
    <span className={styles.both}>
      <span lang="zh-CN">{inZh}</span>
      <span lang="en">{inEn}</span>
    </span>
  );
}

const both = (key: MessageKey, vars?: Record<string, string | number>) => <Both text={(i) => i.t(key, vars)} />;
const money = (cents: number) => en.money(cents / 100);

function groupLabel(i: I18n, line: PayLine, g: Group, config: RuleConfig | undefined) {
  const tier = config && config.tiers.length > 1 ? i.t(line.penalty ? "rule.tierHeadingCases" : "rule.tierHeading", { n: g.tier + 1, range: rangeLabels(i, config.tiers, "count")[g.tier] }) : null;
  const band = config && config.bands.length > 1 ? rangeLabels(i, config.bands, "kg")[g.band] : null;
  return [tier, band].filter(Boolean).join(" · ") || i.t(line.penalty ? "sim.allCases" : "run.allParcels");
}

const caseLabel = (c: PenaltyCase) =>
  [c.occurredAt ? en.date(new Date(`${c.occurredAt.slice(0, 10)}T00:00:00Z`), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : null, c.waybill, c.note]
    .filter(Boolean)
    .join(" · ");

function Lines({ lines, run, result, caption }: { lines: PayLine[]; run: RunView; result: ResultView; caption: MessageKey }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>{both(caption)}</caption>
        <thead>
          <tr>
            <th scope="col">{both("payslip.item")}</th>
            <th scope="col" data-numeric>
              {both("payslip.qty")}
            </th>
            <th scope="col" data-numeric>
              {both("payslip.rate")}
            </th>
            <th scope="col" data-numeric>
              {both("payslip.amount")}
            </th>
          </tr>
        </thead>
        {lines.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={4}>{both("payslip.none")}</td>
            </tr>
          </tbody>
        )}
        {lines.map((line) => {
          const config = run.rules[line.versionId]?.config;
          const flat = config?.valueType === "flat";
          const fromFile = line.ruleId.startsWith("file:");
          const penalty = line.penalty;
          return (
            <tbody key={line.ruleId}>
              <tr className={styles.line}>
                <th scope="row">
                  <span className={styles.both}>
                    {penalty ? <Both text={(i) => penaltyLabel(i, penalty)} /> : both(`kind.${line.kind}`)}
                    {fromFile ? both("run.fromFile") : line.ruleId === ADVANCE ? both("advance.line") : [zh, en].some((i) => i.t(`kind.${line.kind}`) === line.name) ? null : <span>{line.name}</span>}
                  </span>
                </th>
                <td data-numeric>{en.number(line.units)}</td>
                <td />
                <td data-numeric>{money(line.cents)}</td>
              </tr>
              {line.groups.map((g) => (
                <tr key={`${g.tier}:${g.band}`} className={styles.sub}>
                  <td>
                    <Both text={(i) => groupLabel(i, line, g, config)} />
                  </td>
                  <td data-numeric>{flat ? null : en.number(g.units)}</td>
                  <td data-numeric>{flat ? null : en.rate(g.rate)}</td>
                  <td data-numeric>{money(g.cents)}</td>
                </tr>
              ))}
              {result.penalties
                .filter((c) => c.type === penalty)
                .map((c) => (
                  <tr key={c.id} className={styles.sub}>
                    <td>{caseLabel(c)}</td>
                    <td data-numeric>{fromFile ? en.number(1) : null}</td>
                    <td />
                    <td data-numeric>{fromFile && c.amountCents !== null ? money(c.amountCents) : null}</td>
                  </tr>
                ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function Payslip({ run, result, company }: { run: RunView; result: ResultView; company: Company }) {
  const [year, month] = [periodYear(run.period), periodMonth(run.period)];
  const deducting = (l: PayLine) => DEDUCTING.includes(l.kind);
  const profile = result.profile;
  const facts: [MessageKey, ReactNode][] = [
    ["payslip.name", result.name],
    ["payslip.id", result.extId],
    ["payslip.outlet", run.outlet],
    ["payslip.parcels", en.number(result.parcels)],
    ["payslip.profile", profile ? <Both text={(i) => [vehicleLabel(i, profile.vehicle), employmentLabel(i, profile.employment)].join(" · ")} /> : both("profile.notSet")],
  ];

  return (
    <article className={styles.slip} aria-label={`${result.name} ${en.month(year, month)}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.company}>{company.name}</p>
          {company.companyRegistrationNo && <p className={styles.muted}>{company.companyRegistrationNo}</p>}
          {company.companyAddress && <p className={styles.muted}>{company.companyAddress}</p>}
        </div>
        <div>
          <h2 className={styles.title}>{both("payslip.title")}</h2>
          <p className={styles.period}>
            <Both text={(i) => i.month(year, month)} />
          </p>
          {run.status === "DRAFT" && <p className={`${styles.period} ${styles.draft}`}>{both("payslip.draft")}</p>}
        </div>
      </header>

      <dl className={styles.facts}>
        {facts.map(([key, value]) => (
          <div key={key}>
            <dt>{both(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {result.warnings.length > 0 && (
        <p className={styles.draft}>
          <Both text={(i) => result.warnings.map((w) => warningText(i, w)).join("; ")} />
        </p>
      )}

      <Lines lines={result.lines.filter((l) => !deducting(l))} run={run} result={result} caption="payslip.earnings" />
      <Lines lines={result.lines.filter(deducting)} run={run} result={result} caption="payslip.deductions" />

      <dl className={styles.facts}>
        <div>
          <dt>{both("payslip.totalEarnings")}</dt>
          <dd>{money(result.earningsCents)}</dd>
        </div>
        <div>
          <dt>{both("payslip.totalDeductions")}</dt>
          <dd>{money(result.deductionCents)}</dd>
        </div>
      </dl>
      <div className={styles.net}>
        {both("payslip.net")}
        <span>{money(result.netCents)}</span>
      </div>

      <footer className={styles.foot}>
        <p className={styles.muted}>{both("payslip.generated")}</p>
        {company.stampImageUrl && (
          // A plain img: the stamp lives on the R2 public host, and print needs no optimisation.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.stampImageUrl} alt={en.t("payslip.stamp")} className={styles.stamp} />
        )}
      </footer>
    </article>
  );
}

/** Payslips ready to print: one run's, one dispatcher's, or every finalised branch of a month. */
export function Payslips({ slips, company, back, lang, langHref }: { slips: { run: RunView; result: ResultView }[]; company: Company; back?: string; lang: SlipLang; langHref: (l: SlipLang) => string }) {
  // Without `back` this is a dispatcher's own link: no way into the app, and no setup hints.
  const missing = back !== undefined && (!company.companyRegistrationNo || !company.companyAddress);
  return (
    <div>
      <div className={styles.toolbar}>
        {back && (
          <Link href={back} className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {both("run.back")}
          </Link>
        )}
        <span className={ui.help}>
          <Both text={(i) => i.tp("payslip.count", slips.length)} />
        </span>
        <nav className={styles.langs} aria-label={`${zh.t("payslip.language")} · ${en.t("payslip.language")}`}>
          {SLIP_LANGS.map((l) => (
            <Link key={l} href={langHref(l)} aria-current={l === lang ? "true" : undefined} replace scroll={false}>
              {en.t(`payslip.lang.${l}`)}
            </Link>
          ))}
        </nav>
        <PrintButton label={`${zh.t("payslip.print")} · ${en.t("payslip.print")}`} />
        {missing && (
          <p className={styles.hint}>
            <Link href="/app/settings" className={ui.link}>
              {both("payslip.companyMissing")}
            </Link>
          </p>
        )}
      </div>
      <div className={styles.sheets} data-lang={lang}>
        {slips.map(({ run, result }) => (
          <Payslip key={result.id} run={run} result={result} company={company} />
        ))}
      </div>
    </div>
  );
}
