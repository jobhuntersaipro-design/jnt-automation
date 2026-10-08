import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getV2Agent } from "@/lib/ui-version";
import { getI18n } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/v2/shell/language-toggle";
import { AccountMenu, ImpersonationBar, NavLinks } from "@/components/v2/shell/header-parts";
import styles from "@/components/v2/shell/shell.module.css";

// Signed-in v2 pages. v1 accounts bounce back to /dashboard.
export default async function V2ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/login");
  if (!session.user.isApproved) redirect("/auth/pending");
  const v2 = await getV2Agent();
  if (!v2) redirect("/dashboard");

  const { t } = await getI18n();
  const agent = await prisma.agent.findUnique({ where: { id: v2.agentId }, select: { name: true, email: true } });
  const nav = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/payroll", label: t("nav.payroll") },
    { href: "/app/penalties", label: t("nav.penalties") },
    { href: "/app/dispatchers", label: t("nav.dispatchers") },
    { href: "/app/outlets", label: t("nav.outlets") },
    { href: "/app/rules", label: t("nav.rules") },
  ];
  // Design review is for the EasyStaff team, reached by viewing as a v2 account.
  if (v2.impersonating) nav.push({ href: "/app/design", label: t("nav.design") });

  return (
    <>
      {v2.impersonating && <ImpersonationBar name={v2.impersonatedName ?? ""} />}
      <header className={styles.header}>
        <Link href="/app" className={styles.brand}>
          <Image src="/logo-blue.png" alt={t("app.name")} width={140} height={36} priority className={styles.logo} />
        </Link>
        <nav aria-label={t("nav.label")} className={styles.nav}>
          <NavLinks items={nav} />
        </nav>
        <div className={styles.actions}>
          <LanguageToggle />
          <AccountMenu name={agent?.name || agent?.email || ""} />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
