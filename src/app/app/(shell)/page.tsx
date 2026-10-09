import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Prisma } from "@/generated/prisma/client";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { chosenOutlet, chosenPeriod } from "@/lib/v2/scope";
import { v2Session } from "@/lib/v2/session";
import { monthLabel } from "@/components/v2/labels";
import ui from "@/components/v2/ui.module.css";
import styles from "./home.module.css";

const RM = "RM ";
const MAX_ATTENTION = 12;

// The sidebar's month (and branch, when one is chosen) at a glance, what needs doing, and (until it's done) the three setup steps.
export default async function V2Dashboard() {
  const s = await v2Session();
  if (!s) notFound();
  const i18n = await getI18n();
  const { t, tp } = i18n;
  const [period, chosen, codes] = await Promise.all([
    chosenPeriod(s.agentId),
    chosenOutlet(),
    prisma.branch.findMany({
      where: { agentId: s.agentId, isDemo: false },
      select: { code: true },
    }),
  ]);
  const outlet = chosen && codes.some((b) => b.code === chosen) ? chosen : null;
  const [rateCards, allRuns, flagged, unmatched] = await Promise.all([
    prisma.payRuleAssignment.count({
      where: { agentId: s.agentId, kind: "PARCEL", rule: { archivedAt: null } },
    }),
    prisma.payrollRun.findMany({
      where: { agentId: s.agentId },
      // Most recently worked on first: uploading an older month makes it the one shown.
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        period: true,
        status: true,
        parcelCount: true,
        branch: { select: { code: true } },
      },
    }),
    prisma.payrollResult.groupBy({
      by: ["runId"],
      where: {
        run: { agentId: s.agentId, status: "DRAFT" },
        warnings: { not: Prisma.DbNull },
      },
      _count: { _all: true },
    }),
    prisma.penaltyItem.groupBy({
      by: ["period"],
      where: {
        agentId: s.agentId,
        status: "UNMATCHED",
        ...(outlet && { outlet }),
      },
      _count: { _all: true },
      orderBy: { period: "desc" },
    }),
  ]);
  const runs = outlet
    ? allRuns.filter((r) => r.branch.code === outlet)
    : allRuns;
  const outlets = outlet ? 1 : codes.length;
  const flaggedBy = new Map(flagged.map((f) => [f.runId, f._count._all]));
  const steps = [
    {
      done: rateCards > 0,
      href: "/app/rules",
      title: t("dashboard.rules"),
      body: t("dashboard.rulesBody"),
    },
    {
      done: allRuns.length > 0,
      href: "/app/payroll",
      title: t("dashboard.run"),
      body: t("dashboard.runBody"),
    },
    {
      done: allRuns.length > 0 && flagged.length === 0,
      href: "/app/dispatchers",
      title: t("dashboard.people"),
      body: t("dashboard.peopleBody"),
    },
  ];
  const setUp = steps.every((step) => step.done);

  const latestRuns = runs.filter((r) => r.period === period);
  const month = monthLabel(i18n, period);
  const inLatest = { runId: { in: latestRuns.map((r) => r.id) } };
  const [net, paid] = latestRuns.length
    ? await Promise.all([
        prisma.payrollResult.aggregate({
          where: inLatest,
          _sum: { netCents: true },
        }),
        prisma.payrollResult.count({
          where: { ...inLatest, netCents: { gt: 0 } },
        }),
      ])
    : [null, 0];

  const attention = [
    ...runs
      .filter((r) => r.status === "DRAFT")
      .map((r) => {
        const what = {
          outlet: r.branch.code,
          month: monthLabel(i18n, r.period),
        };
        const count = flaggedBy.get(r.id) ?? 0;
        return {
          href: `/app/payroll/${r.id}`,
          text:
            count > 0
              ? tp("dashboard.attention.run", count, what)
              : t("dashboard.attention.draft", what),
        };
      }),
    ...unmatched.map((u) => ({
      href: `/app/penalties?month=${u.period}`,
      text: tp("dashboard.attention.penalties", u._count._all, {
        month: monthLabel(i18n, u.period),
      }),
    })),
  ].slice(0, MAX_ATTENTION);

  return (
    <div className={ui.page}>
      <header>
        <h1 className={ui.title}>{t("dashboard.title")}</h1>
        {!setUp && <p className={ui.subtitle}>{t("dashboard.intro")}</p>}
      </header>

      {allRuns.length > 0 && (
        <section className={ui.stack} aria-labelledby="latest-title">
          <h2 id="latest-title" className={ui.cardTitle}>
            {outlet
              ? t("dashboard.latestAt", { month, outlet })
              : t("dashboard.latest", { month })}
          </h2>
          {latestRuns.length === 0 ? (
            <p className={ui.muted}>
              {t("dashboard.noRun", { month })}{" "}
              <Link href="/app/payroll/new" className={ui.link}>
                {t("wizard.start")}
              </Link>
            </p>
          ) : (
            <div className={styles.metrics}>
              <MetricCard
                label={t("dashboard.net")}
                value={(net?._sum.netCents ?? 0) / 100}
                prefix={RM}
                decimals={2}
                locale={i18n.tag}
                context={month}
              />
              <MetricCard
                label={t("dashboard.dispatchers")}
                value={paid}
                locale={i18n.tag}
                context={month}
              />
              <MetricCard
                label={t("dashboard.parcels")}
                value={latestRuns.reduce((n, r) => n + r.parcelCount, 0)}
                locale={i18n.tag}
                context={month}
              />
              <MetricCard
                label={t("dashboard.finalised")}
                value={latestRuns.filter((r) => r.status === "FINAL").length}
                locale={i18n.tag}
                context={t("dashboard.ofOutlets", {
                  count: Math.max(outlets, latestRuns.length),
                })}
              />
            </div>
          )}
        </section>
      )}

      {allRuns.length > 0 && (
        <section className={ui.card} aria-labelledby="attention-title">
          <h2 id="attention-title" className={ui.cardTitle}>
            {t("dashboard.attention")}
          </h2>
          {attention.length === 0 ? (
            <p className={ui.muted}>{t("dashboard.allClear")}</p>
          ) : (
            <ul className={ui.list}>
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className={ui.link}>
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!setUp && (
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.href} className={ui.card}>
              <span className={styles.step}>
                {step.done ? (
                  <CheckCircle2
                    className={styles.done}
                    size={22}
                    aria-label={t("dashboard.done")}
                  />
                ) : (
                  <Circle
                    className={styles.todo}
                    size={22}
                    aria-label={t("dashboard.todo")}
                  />
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
      )}
    </div>
  );
}
