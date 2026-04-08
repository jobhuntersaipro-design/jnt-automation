import Image from "next/image";
import { NavLinks } from "@/components/dashboard/nav-links";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Top nav */}
      <header className="h-16 shrink-0 flex items-center px-16 bg-surface-dim">
        <a href="/dashboard" className="shrink-0">
          <Image
            src="/logo-blue.png"
            alt="EasyStaff"
            width={140}
            height={36}
            className="h-12 w-auto"
            priority />
        </a>

        <div className="mx-2 shrink-0" />

        <NavLinks />

        {/* Right side — icons + user */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <NotificationBell />

          <div className="w-px h-5 bg-outline-variant/40 mx-1" />

          <AccountMenu
            name={session?.user?.name ?? "User"}
            imageUrl={session?.user?.image}
            isSuperAdmin={session?.user?.isSuperAdmin ?? false}
          />
        </div>
      </header>

      {/* Main content — flex so children can fill and scroll */}
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>
    </div>
  );
}
