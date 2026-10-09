"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/arc/drawer/drawer";
import { Select } from "@/components/arc/select/select";
import { useI18n } from "@/components/v2/i18n-provider";
import { periodFromInput, periodFromParam, periodToInput } from "@/lib/v2/pay/resolve";
import { NavLinks } from "./header-parts";
import ui from "@/components/v2/ui.module.css";
import styles from "./shell.module.css";

export interface SidebarProps {
  nav: { href: string; label: string }[];
  outlets: string[];
  /** The month the server resolved without a `?month=` (cookie, else month worked on last). */
  month: number;
  outlet: string | null;
  /** False for a branch supervisor: no "All branches" choice. */
  allBranches?: boolean;
}

const ALL = "all";
const YEAR = 60 * 60 * 24 * 365;
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/app; max-age=${value ? YEAR : 0}; samesite=lax`;
};

/** Outlet and month chosen once for Payroll, Penalties and Dispatchers. */
function Scope({ outlets, month, outlet, allBranches = true }: Omit<SidebarProps, "nav">) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = periodFromParam(params.get("month") ?? undefined);
  const shown = fromUrl ?? month;

  // A link into a month (`?month=`) becomes the chosen month, so it stays when moving to another page.
  useEffect(() => {
    if (fromUrl && fromUrl !== month) {
      setCookie("es-month", String(fromUrl));
      router.refresh();
    }
  }, [fromUrl, month, router]);

  function reload() {
    const query = new URLSearchParams(params);
    query.delete("month");
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
    router.refresh();
  }

  return (
    <div className={styles.scope}>
      {outlets.length > 1 && (
        <Select
          label={t("scope.outlet")}
          value={outlet && outlets.includes(outlet) ? outlet : allBranches ? ALL : outlets[0]}
          onValueChange={(v) => {
            setCookie("es-outlet", v === ALL ? "" : v);
            reload();
          }}
          options={[...(allBranches ? [{ value: ALL, label: t("scope.allOutlets") }] : []), ...outlets.map((o) => ({ value: o, label: o }))]}
        />
      )}
      <label className={ui.field}>
        <span className={ui.label}>{t("scope.month")}</span>
        <input
          type="month"
          className={ui.input}
          value={periodToInput(shown)}
          onChange={(e) => {
            const p = periodFromInput(e.target.value);
            if (!p) return;
            setCookie("es-month", String(p));
            reload();
          }}
        />
      </label>
    </div>
  );
}

function SidebarBody({ nav, ...scope }: SidebarProps) {
  const { t } = useI18n();
  return (
    <>
      <Link href="/app" className={styles.brand}>
        <Image src="/logo-blue.png" alt={t("app.name")} width={140} height={36} priority className={styles.logo} />
      </Link>
      <Scope {...scope} />
      <nav aria-label={t("nav.label")} className={styles.nav}>
        <NavLinks items={nav} />
      </nav>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <SidebarBody {...props} />
    </aside>
  );
}

/** Under 64rem the sidebar opens from a menu button; it closes when a page is picked. */
export function MobileMenu(props: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger className={styles.menuButton} aria-label={t("nav.menu")}>
        <Menu size={20} aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent side="left" title={t("nav.menu")} className={styles.drawer}>
        <div className={styles.drawerBody}>
          <SidebarBody {...props} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
