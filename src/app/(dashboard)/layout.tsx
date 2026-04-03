import Image from "next/image";
import Link from "next/link";
import { NavLinks } from "@/components/dashboard/nav-links";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { AccountMenu } from "@/components/dashboard/account-menu";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Top nav */}
      <header className="h-20 shrink-0 flex items-center px-20 bg-surface-dim">
        <Link href="/dashboard" className="shrink-0">
          <Image
            src="/logo-new.png"
            alt="EasyStaff"
            width={140}
            height={36}
            className="h-14 w-auto"
            priority />
        </Link>

        <div className="mx-3 shrink-0" />

        <NavLinks />

        {/* Right side — icons + user */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <NotificationBell />

          <div className="w-px h-5 bg-outline-variant/40 mx-1" />

          <AccountMenu />
        </div>
      </header>

      {/* Main content — flex so children can fill and scroll */}
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>
    </div>
  );
}
