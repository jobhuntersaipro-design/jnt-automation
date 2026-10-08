import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { v2Session } from "@/lib/v2/session";
import ui from "@/components/v2/ui.module.css";
import styles from "./home.module.css";

// Getting started: the three things a new v2 account does before its first payroll.
export default async function V2Dashboard() {
  const s = await v2Session();
  if (!s) notFound();
  const { t } = await getI18n();
  const [rateCards, runs, unpaid] = await Promise.all([
    prisma.payRuleAssignment.count({ where: { agentId: s.agentId, kind: "PARCEL", rule: { archivedAt: null } } }),
    prisma.payrollRun.count({ where: { agentId: s.agentId } }),
    prisma.payrollResult.count({ where: { run: { agentId: s.agentId, status: "DRAFT" }, warnings: { not: Prisma.DbNull } } }),
  ]);
  const steps = [
    { done: rateCards > 0, href: "/app/rules", title: t("dashboard.rules"), body: t("dashboard.rulesBody") },
    { done: runs > 0, href: "/app/payroll", title: t("dashboard.run"), body: t("dashboard.runBody") },
    { done: runs > 0 && unpaid === 0, href: "/app/dispatchers", title: t("dashboard.people"), body: t("dashboard.peopleBody") },
  ];

  return (
    <div className={ui.page}>
      <header>
        <h1 className={ui.title}>{t("dashboard.title")}</h1>
        <p className={ui.subtitle}>{t("dashboard.intro")}</p>
      </header>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.href} className={ui.card}>
            <span className={styles.step}>
              {step.done ? (
                <CheckCircle2 className={styles.done} size={22} aria-label={t("dashboard.done")} />
              ) : (
                <Circle className={styles.todo} size={22} aria-label={t("dashboard.todo")} />
              )}
              <span className={styles.text}>
                <Link href={step.href} className={styles.title}>
                  {step.title}
                </Link>
                <span className={ui.help}>{step.body}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
