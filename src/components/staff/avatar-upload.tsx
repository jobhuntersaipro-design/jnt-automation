"use client";

import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

const ACCEPTED = ".jpg,.jpeg,.png,.webp";
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

interface AvatarUploadProps {
  dispatcherId: string;
  avatarUrl: string | null;
  initials: string;
  ringColor: string;
  onAvatarChange: (url: string | null) => void;
}

export function AvatarUpload({ dispatcherId, avatarUrl, initials, ringColor, onAvatarChange }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG, and WebP files are allowed");
      return;
    }

    if (file.size > MAX_SIZE) {
      toast.error("File must be under 2MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/staff/${dispatcherId}/avatar`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to upload photo");
        return;
      }

      const { avatarUrl: newUrl } = await res.json();
      onAvatarChange(newUrl);
      toast.success("Photo updated");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const res = await fetch(`/api/staff/${dispatcherId}/avatar`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onAvatarChange(null);
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center bg-surface-low text-[1.1rem] font-semibold text-on-surface-variant shrink-0 overflow-hidden"
          style={{ outline: `2px solid ${ringColor}`, outlineOffset: "2px" }}
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="Avatar" width={64} height={64} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-on-surface/30 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-[0.78rem] font-medium text-brand hover:text-brand/80 transition-colors disabled:opacity-50"
        >
          <Camera size={13} className="inline mr-1 -mt-0.5" />
          Upload photo
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="text-[0.72rem] text-on-surface-variant hover:text-critical transition-colors disabled:opacity-50 text-left"
          >
            <X size={11} className="inline mr-0.5 -mt-0.5" />
            Remove photo
          </button>
        )}
        <p className="text-[0.62rem] text-on-surface-variant/60">JPG, PNG or WebP. Max 2MB.</p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
