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
  dispatcherId: string;
  name: string;
  avatarUrl: string | null;
  ringColor: string;
  size?: Size;
  onAvatarChange: (avatarUrl: string | null) => void;
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
}: DispatcherAvatarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { box, text, icon, px } = SIZE_MAP[size];
  const initials = getInitials(name);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        className={`relative ${box} rounded-full flex items-center justify-center bg-surface-low ${text} font-semibold text-on-surface-variant shrink-0 overflow-hidden group/avatar cursor-pointer`}
        style={{ outline: `2px solid ${ringColor}`, outlineOffset: "1px" }}
        title="Edit avatar"
        aria-label="Edit avatar"
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
        <div className="absolute inset-0 rounded-full bg-on-surface/0 group-hover/avatar:bg-on-surface/30 flex items-center justify-center transition-colors">
          <Camera
            size={icon}
            className="text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity"
          />
        </div>
      </button>

      {dialogOpen && (
        <AvatarEditDialog
          open
          dispatcherId={dispatcherId}
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
