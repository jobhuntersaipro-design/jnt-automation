"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/staff", label: "Staff" },
  { href: "/payroll", label: "Payroll" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center">
      {navItems.map(({ href, label }, i) => {
        const isActive = pathname === href || (href !== "/dashboard" && (pathname + "/").startsWith(href + "/"));
        return (
          <Fragment key={href}>
            {i > 0 && (
              <span className="w-px h-4 bg-outline-variant/40 mx-1 shrink-0" />
            )}
            <Link
              href={href}
              className={`px-2.5 py-0.5 text-[1.02rem] border-b-2 transition-colors ${
                isActive
                  ? "font-bold text-on-surface border-brand"
                  : "font-medium text-on-surface-variant hover:text-on-surface border-transparent hover:border-brand hover:font-bold hover:text-[1.02rem]"
              }`}
            >
              {label}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
