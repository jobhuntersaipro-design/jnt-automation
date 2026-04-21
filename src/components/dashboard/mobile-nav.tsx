"use client";

import { useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";

const BASE_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dispatchers", label: "Dispatchers" },
  { href: "/staff", label: "Staff" },
];

export function MobileNav({ isSuperAdmin, impersonating }: { isSuperAdmin: boolean; impersonating?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);
  const pathname = usePathname();

  const navItems = isSuperAdmin
    ? [...BASE_ITEMS, { href: "/admin", label: "Admin" }]
    : BASE_ITEMS;

  const LinkOrA = impersonating ? "a" : Link;

  return (
    <div ref={ref} className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-hover transition-colors"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full bg-surface-dim border-t border-outline-variant/20 shadow-lg z-50">
          <nav className="flex flex-col py-2">
            {navItems.map(({ href, label }) => {
              const isActive = pathname === href || (href !== "/dashboard" && (pathname + "/").startsWith(href + "/"));
              return (
                <LinkOrA
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`px-6 py-3 text-[0.95rem] transition-colors ${
                    isActive
                      ? "font-bold text-on-surface bg-brand/5 border-l-3 border-brand"
                      : "font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-hover"
                  }`}
                >
                  {label}
                </LinkOrA>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
