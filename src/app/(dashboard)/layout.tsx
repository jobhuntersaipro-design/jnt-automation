import Image from "next/image";
import { NavLinks } from "@/components/dashboard/nav-links";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { BulkJobsIndicator } from "@/components/dashboard/bulk-jobs-indicator";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { BfcacheFix } from "@/components/dashboard/bfcache-fix";
import { WelcomeToast } from "@/components/dashboard/welcome-toast";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getEffectiveAgentId } from "@/lib/impersonation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  if (!session.user.isApproved) redirect("/auth/pending");

  const effective = await getEffectiveAgentId();
  const isImpersonating = effective?.impersonating ?? false;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      <BfcacheFix />
      <WelcomeToast />
      {isImpersonating && (
        <ImpersonationBanner agentName={effective!.impersonatedName!} />
      )}
      {/* Top nav */}
      <header className="h-14 lg:h-16 shrink-0 flex items-center px-4 lg:px-16 bg-surface-dim relative">
        <MobileNav isSuperAdmin={session?.user?.isSuperAdmin ?? false} impersonating={isImpersonating} />

        <a href="/dashboard" className="shrink-0">
          <Image
            src="/logo-blue.png"
            alt="EasyStaff"
            width={140}
            height={36}
            className="h-10 lg:h-12 w-auto"
            priority />
        </a>

        <div className="mx-2 shrink-0 hidden lg:block" />

        <div className="hidden lg:block">
          <NavLinks isSuperAdmin={session?.user?.isSuperAdmin ?? false} impersonating={isImpersonating} />
        </div>

        {/* Right side — icons + user */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative">
            <NotificationBell />
            <BulkJobsIndicator />
          </div>

          <div className="w-px h-5 bg-outline-variant/40 mx-1 hidden sm:block" />

          <div className="hidden sm:block">
            <AccountMenu
              name={session?.user?.name ?? "User"}
              imageUrl={session?.user?.image}
              isSuperAdmin={session?.user?.isSuperAdmin ?? false}
            />
          </div>
        </div>
      </header>

      {/* Main content — flex so children can fill and scroll */}
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>

    </div>
  );
}
