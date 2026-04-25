"use client";

import { useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useClickOutside } from "@/lib/hooks/use-click-outside";
import { UserAvatar } from "@/components/ui/avatar";

const BASE_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/branches", label: "Branches" },
  { href: "/dispatchers", label: "Dispatchers" },
  { href: "/staff", label: "Staff" },
];

interface MobileNavProps {
  isSuperAdmin: boolean;
  impersonating?: boolean;
  userName: string;
  userImage?: string | null;
}

export function MobileNav({ isSuperAdmin, impersonating, userName, userImage }: MobileNavProps) {
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
        aria-label={open ? "Close menu" : "Open menu"}
        className="p-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-hover transition-colors cursor-pointer"
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

            <div className="border-t border-outline-variant/30 mt-2 pt-3 px-6 pb-2 flex items-center gap-3">
              <UserAvatar
                name={userName}
                imageUrl={userImage}
                size="sm"
                isSuperAdmin={isSuperAdmin}
              />
              <span className="text-[0.9rem] font-semibold text-on-surface truncate">
                {userName}
              </span>
            </div>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="px-6 py-3 text-[0.95rem] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-hover transition-colors flex items-center gap-3"
            >
              <Settings size={16} />
              Settings
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                signOut({ redirectTo: "/auth/login?logged_out=1" });
              }}
              className="px-6 py-3 text-[0.95rem] font-medium text-critical hover:bg-tertiary/5 transition-colors flex items-center gap-3 text-left cursor-pointer"
            >
              <LogOut size={16} />
              Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
