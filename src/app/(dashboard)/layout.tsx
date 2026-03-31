import Image from "next/image";
import Link from "next/link";
import { Bell, CircleHelp } from "lucide-react";
import { NavLinks } from "@/components/dashboard/nav-links";

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
          />
        </Link>

        <div className="mx-3 shrink-0" />

        <NavLinks />

        {/* Right side — icons + user */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors">
            <CircleHelp size={18} className="text-on-surface-variant" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-hover transition-colors">
            <Bell size={18} className="text-on-surface-variant" />
          </button>

          <div className="w-px h-5 bg-outline-variant/40 mx-1" />

          {/* Avatar + user info */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-[0.9rem] font-bold text-white shrink-0">
              A
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[0.975rem] font-semibold text-on-surface">Admin</span>
              <span className="text-[0.78rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant">
                Super Admin
              </span>
            </div>
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
