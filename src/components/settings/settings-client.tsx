"use client";

import { useState, useEffect } from "react";
import { signIn, signOut } from "next-auth/react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/avatar";

interface SettingsClientProps {
  name: string;
  email: string;
  imageUrl: string | null;
  hasPassword: boolean;
  connectedProviders: string[];
}

export function SettingsClient({
  name: initialName,
  email,
  imageUrl,
  hasPassword,
  connectedProviders,
}: SettingsClientProps) {
  return (
    <div className="flex flex-col gap-10">
      <ProfileSection initialName={initialName} email={email} imageUrl={imageUrl} />
      <SecuritySection hasPassword={hasPassword} connectedProviders={connectedProviders} />
      <DangerZoneSection />
    </div>
  );
}

/* ─── Profile ─────────────────────────────────────────────── */

function ProfileSection({
  initialName,
  email,
  imageUrl,
}: {
  initialName: string;
  email: string;
  imageUrl: string | null;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (name.trim() === initialName) return;

    setSaving(true);
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to update profile.");
      return;
    }
    toast.success("Profile updated.");
  }

  return (
    <section>
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-4">
        Profile
      </h2>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <UserAvatar name={name || initialName} imageUrl={imageUrl} size="lg" />
          <div>
            <p className="text-sm font-medium text-on-surface">{name || initialName}</p>
            <p className="text-xs text-on-surface-variant">{email}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || name.trim() === initialName}
            className="bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─── Security ────────────────────────────────────────────── */

function SecuritySection({
  hasPassword,
  connectedProviders,
}: {
  hasPassword: boolean;
  connectedProviders: string[];
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isGoogleLinked = mounted && connectedProviders.includes("google");

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to change password.");
      return;
    }

    toast.success("Password changed successfully.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const inputClass =
    "w-full border border-outline-variant rounded-md px-3 py-2 pr-10 text-sm text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  return (
    <section>
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-4">
        Security
      </h2>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-6">
        {/* Change Password */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Change Password</h3>
          {hasPassword ? (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleChangePassword}
                  disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                  className="bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {saving ? "Changing..." : "Change Password"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Your account uses Google sign-in and has no password set. Use the{" "}
              <a href="/auth/forgot-password" className="text-primary hover:underline">
                forgot password
              </a>{" "}
              page to set one.
            </p>
          )}
        </div>

        {/* Connected Accounts */}
        <div className="border-t border-outline-variant/20 pt-5 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Connected Accounts</h3>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-sm text-on-surface">Google</span>
            </div>
            <button
              onClick={isGoogleLinked ? undefined : () => signIn("google", { redirectTo: "/dashboard/settings" })}
              disabled={isGoogleLinked}
              className={`text-xs font-medium px-3 py-1.5 rounded-md ${
                isGoogleLinked
                  ? "bg-primary/10 text-primary cursor-default"
                  : "border border-outline-variant text-on-surface hover:bg-surface-hover transition-colors"
              }`}
            >
              {isGoogleLinked ? "Connected" : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Danger Zone ─────────────────────────────────────────── */

function DangerZoneSection() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (confirmText !== "DELETE") return;

    setDeleting(true);
    const res = await fetch("/api/settings/account", { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to delete account.");
      return;
    }

    signOut({ redirectTo: "/auth/login" });
  }

  return (
    <section>
      <h2 className="font-manrope font-semibold text-lg text-critical mb-4">
        Danger Zone
      </h2>
      <div className="bg-surface-card rounded-lg p-6 border border-critical/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">Delete Account</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="bg-critical text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>

        {showConfirm && (
          <div className="mt-5 pt-5 border-t border-critical/20">
            <p className="text-sm text-on-surface mb-3">
              This action is <strong>irreversible</strong>. All your branches,
              dispatchers, uploads, and salary records will be permanently
              deleted. Type <strong>DELETE</strong> to confirm.
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Type "DELETE"'
                className="flex-1 border border-critical/30 rounded-md px-3 py-2 text-sm text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-critical/30 focus:border-critical transition-colors"
              />
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="bg-critical text-white rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="text-sm text-on-surface-variant hover:text-on-surface transition-colors px-3"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
