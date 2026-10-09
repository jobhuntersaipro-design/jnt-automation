import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getV2Agent } from "@/lib/ui-version";
import { getI18n } from "@/lib/i18n/server";
import { chosenOutlet, chosenPeriod } from "@/lib/v2/scope";
import { LanguageToggle } from "@/components/v2/shell/language-toggle";
import { AccountMenu, ImpersonationBar } from "@/components/v2/shell/header-parts";
import { MobileMenu, Sidebar } from "@/components/v2/shell/sidebar";
import styles from "@/components/v2/shell/shell.module.css";

// Signed-in v2 pages. v1 accounts bounce back to /dashboard.
export default async function V2ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/login");
  if (!session.user.isApproved) redirect("/auth/pending");
  const v2 = await getV2Agent();
  if (!v2) redirect("/dashboard");

  const { t } = await getI18n();
  // A branch supervisor sees their own name and photo, and only their branches.
  const [agent, branches, month, outlet] = await Promise.all([
    prisma.agent.findUnique({ where: { id: v2.member?.id ?? v2.agentId }, select: { name: true, email: true, avatarUrl: true } }),
    prisma.branch.findMany({ where: { agentId: v2.agentId, ...(v2.member && { id: { in: v2.member.branchIds } }) }, select: { code: true }, orderBy: { code: "asc" } }),
    chosenPeriod(v2.agentId),
    chosenOutlet(v2),
  ]);
  const nav = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/payroll", label: t("nav.payroll") },
    { href: "/app/penalties", label: t("nav.penalties") },
    { href: "/app/success-rates", label: t("nav.success") },
    { href: "/app/advances", label: t("nav.advances") },
    { href: "/app/dispatchers", label: t("nav.dispatchers") },
    ...(v2.member
      ? []
      : [
          { href: "/app/branches", label: t("nav.outlets") },
          { href: "/app/rules", label: t("nav.rules") },
        ]),
  ];
  // Design review is for the EasyStaff team, reached by viewing as a v2 account.
  if (v2.impersonating) nav.push({ href: "/app/design", label: t("nav.design") });
  const sidebar = { nav, outlets: branches.map((b) => b.code), month, outlet, allBranches: !v2.member };
  const name = agent?.name || agent?.email || "";

  return (
    <div className={styles.frame}>
      <Sidebar {...sidebar} />
      <div className={styles.column}>
        {v2.impersonating && <ImpersonationBar name={v2.impersonatedName ?? ""} />}
        <header className={styles.header}>
          <MobileMenu {...sidebar} />
          <div className={styles.actions}>
            <LanguageToggle />
            <AccountMenu name={name} avatarUrl={agent?.avatarUrl ?? (v2.impersonating ? null : session.user.image) ?? null} />
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
