"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/staff", label: "Staff" },
  { href: "/payroll", label: "Payroll" },
];

export function NavLinks({ isSuperAdmin, impersonating }: { isSuperAdmin: boolean; impersonating?: boolean }) {
  const navItems = isSuperAdmin
    ? [...BASE_ITEMS, { href: "/admin", label: "Admin" }]
    : BASE_ITEMS;
  const pathname = usePathname();

  // During impersonation, use <a> tags to skip Next.js Router Cache
  // so every page renders fresh with the impersonated agentId
  const LinkOrA = impersonating ? "a" : Link;

  return (
    <nav className="flex items-center">
      {navItems.map(({ href, label }, i) => {
        const isActive = pathname === href || (href !== "/dashboard" && (pathname + "/").startsWith(href + "/"));
        return (
          <Fragment key={href}>
            {i > 0 && (
              <span className="w-px h-4 bg-outline-variant/40 mx-1 shrink-0" />
            )}
            <LinkOrA
              href={href}
              className={`px-2.5 py-0.5 text-[1.02rem] border-b-2 transition-colors ${
                isActive
                  ? "font-bold text-on-surface border-brand"
                  : "font-medium text-on-surface-variant hover:text-on-surface border-transparent hover:border-brand hover:font-bold hover:text-[1.02rem]"
              }`}
            >
              {label}
            </LinkOrA>
          </Fragment>
        );
      })}
    </nav>
  );
}
