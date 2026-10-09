"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu";
import { Button } from "@/components/arc/button/button";
import { useI18n } from "@/components/v2/i18n-provider";
import styles from "./shell.module.css";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return items.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={styles.navLink}
      aria-current={pathname === item.href || (item.href !== "/app" && pathname.startsWith(`${item.href}/`)) ? "page" : undefined}
    >
      {item.label}
    </Link>
  ));
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return url ? (
    <Image src={url} alt="" width={28} height={28} unoptimized className={styles.avatar} />
  ) : (
    <span className={styles.avatar}>{initials}</span>
  );
}

export function AccountMenu({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  // First name only, so a long name never crowds the mobile header.
  const label = name.split(/\s+/)[0] || name;
  // next-auth/react signs out with a full page load, so no v2 styles carry over to the next page.
  return (
    <DropdownMenu
      label={label}
      icon={<Avatar name={name} url={avatarUrl} />}
      items={[
        { label: t("user.settings"), onSelect: () => router.push("/app/settings") },
        { label: t("user.signOut"), onSelect: () => signOut({ callbackUrl: "/app/login" }) },
      ]}
    />
  );
}

/** Shown to a superadmin viewing as a v2 account. */
export function ImpersonationBar({ name }: { name: string }) {
  const { t } = useI18n();
  async function exit() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    window.location.href = "/admin";
  }
  return (
    <div className={styles.banner} role="status">
      <span>{t("user.viewingAs", { name })}</span>
      <Button size="sm" variant="secondary" onClick={exit}>
        {t("user.exit")}
      </Button>
    </div>
  );
}
