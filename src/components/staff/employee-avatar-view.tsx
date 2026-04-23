"use client";

import Image from "next/image";
import type { Gender } from "@/generated/prisma/client";

/**
 * Read-only avatar for employees used in tables (Settings / Payroll rows).
 * Resolves the avatar source the same way the drawer does: dispatcher avatar
 * wins when linked, otherwise the employee's own avatar. Falls back to
 * initials. Ring colour follows gender for parity with the dispatcher list.
 */

type Size = "sm" | "md";

const SIZE_MAP: Record<Size, { box: string; text: string; px: number }> = {
  sm: { box: "w-8 h-8", text: "text-[0.68rem]", px: 32 },
  md: { box: "w-9 h-9", text: "text-[0.72rem]", px: 36 },
};

interface EmployeeAvatarViewProps {
  name: string;
  gender: Gender;
  avatarUrl: string | null;
  dispatcherAvatarUrl?: string | null;
  size?: Size;
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function ringColorFor(gender: Gender): string {
  if (gender === "MALE") return "var(--color-brand)";
  if (gender === "FEMALE") return "var(--color-female-ring)";
  return "var(--color-outline-variant)";
}

export function EmployeeAvatarView({
  name,
  gender,
  avatarUrl,
  dispatcherAvatarUrl,
  size = "sm",
}: EmployeeAvatarViewProps) {
  const url = dispatcherAvatarUrl ?? avatarUrl ?? null;
  const { box, text, px } = SIZE_MAP[size];
  const ring = ringColorFor(gender);
  const initials = getInitials(name);

  return (
    <div
      className={`${box} rounded-full flex items-center justify-center bg-surface-low ${text} font-semibold text-on-surface-variant shrink-0 overflow-hidden`}
      style={{ outline: `2px solid ${ring}`, outlineOffset: "1px" }}
      title={name}
    >
      {url ? (
        <Image src={url} alt="" width={px} height={px} sizes={`${px}px`} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
