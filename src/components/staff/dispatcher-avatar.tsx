"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Camera } from "lucide-react";

// Dialog is rendered only after the user clicks Edit, so both the dialog JS
// chunk and the AvatarEditDialog tree are deferred until first open.
const AvatarEditDialog = dynamic(
  () => import("./avatar-edit-dialog").then((m) => m.AvatarEditDialog),
  { ssr: false },
);

type Size = "sm" | "lg";

const SIZE_MAP: Record<Size, { box: string; text: string; icon: number; px: number }> = {
  sm: { box: "w-8 h-8", text: "text-[0.7rem]", icon: 12, px: 32 },
  lg: { box: "w-14 h-14", text: "text-[1rem]", icon: 18, px: 56 },
};

interface DispatcherAvatarProps {
  /** Treated as a generic subject id. Kept name for back-compat with existing call sites. */
  dispatcherId: string;
  name: string;
  avatarUrl: string | null;
  ringColor: string;
  size?: Size;
  onAvatarChange: (avatarUrl: string | null) => void;
  /** Override the avatar API base path. Defaults to `/api/staff/<dispatcherId>/avatar`. */
  apiBasePath?: string;
  /** Disables the click-to-edit affordance (used when editing the linked dispatcher elsewhere). */
  disabled?: boolean;
  /** Optional tooltip override for the avatar button. */
  title?: string;
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

export function DispatcherAvatar({
  dispatcherId,
  name,
  avatarUrl,
  ringColor,
  size = "sm",
  onAvatarChange,
  apiBasePath,
  disabled,
  title,
}: DispatcherAvatarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { box, text, icon, px } = SIZE_MAP[size];
  const initials = getInitials(name);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setDialogOpen(true);
        }}
        className={`relative ${box} rounded-full flex items-center justify-center bg-surface-low ${text} font-semibold text-on-surface-variant shrink-0 overflow-hidden group/avatar ${disabled ? "cursor-default" : "cursor-pointer"}`}
        style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
        title={title ?? (disabled ? name : "Edit avatar")}
        aria-label={disabled ? `Avatar for ${name}` : "Edit avatar"}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={px}
            height={px}
            sizes={`${px}px`}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
        {!disabled && (
          <div className="absolute inset-0 rounded-full bg-on-surface/0 group-hover/avatar:bg-on-surface/30 flex items-center justify-center transition-colors">
            <Camera
              size={icon}
              className="text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity"
            />
          </div>
        )}
      </button>

      {dialogOpen && (
        <AvatarEditDialog
          open
          dispatcherId={dispatcherId}
          apiBasePath={apiBasePath}
          dispatcherName={name}
          avatarUrl={avatarUrl}
          ringColor={ringColor}
          onClose={() => setDialogOpen(false)}
          onAvatarChange={onAvatarChange}
        />
      )}
    </>
  );
}
