import Image from "next/image";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/payroll", label: "Payroll" },
  { href: "/staff", label: "Staff" },
  { href: "/upload", label: "Upload" },
];

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

        {/* Spacer between logo and nav */}
        <div className="mx-3 shrink-0" />

        <nav className="flex items-center gap-0.5">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1 text-[1rem] font-medium text-on-surface-variant hover:text-on-surface border-b-2 border-transparent hover:border-brand transition-colors hover:text-[1.05rem] hover:font-bold"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Profile placeholder */}
        <div className="ml-auto w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-[0.75rem] font-semibold text-on-surface-variant shrink-0">
          A
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
