"use client";

import { useState, useRef } from "react";
import { signIn, signOut } from "next-auth/react";
import { Eye, EyeOff, Trash2, Upload, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/avatar";

interface SettingsClientProps {
  name: string;
  email: string;
  imageUrl: string | null;
  hasPassword: boolean;
  connectedProviders: string[];
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  memberSince: string;
}

export function SettingsClient({
  name: initialName,
  email,
  imageUrl,
  hasPassword,
  connectedProviders,
  companyRegistrationNo,
  companyAddress,
  stampImageUrl,
  memberSince,
}: SettingsClientProps) {
  return (
    <div className="flex flex-col gap-10">
      <ProfileSection initialName={initialName} email={email} imageUrl={imageUrl} memberSince={memberSince} />
      <CompanySection
        initialRegNo={companyRegistrationNo}
        initialAddress={companyAddress}
        initialStampUrl={stampImageUrl}
      />
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
  memberSince,
}: {
  initialName: string;
  email: string;
  imageUrl: string | null;
  memberSince: string;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(imageUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const memberDate = new Date(memberSince);
  const memberStr = `Member since ${memberDate.toLocaleString("en-US", { month: "long", year: "numeric" })}`;

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

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2MB.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/settings/avatar", {
      method: "POST",
      body: formData,
    });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to upload avatar.");
      return;
    }

    const data = await res.json();
    setAvatar(data.avatarUrl);
    toast.success("Profile picture updated.");
  }

  async function handleAvatarRemove() {
    setUploading(true);
    const res = await fetch("/api/settings/avatar", { method: "DELETE" });
    setUploading(false);

    if (!res.ok) {
      toast.error("Failed to remove profile picture.");
      return;
    }

    setAvatar(null);
    toast.success("Profile picture removed.");
  }

  return (
    <section>
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-4">
        Profile
      </h2>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <UserAvatar name={name || initialName} imageUrl={avatar} size="lg" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera size={16} className="text-white" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-on-surface">{name || initialName}</p>
            <p className="text-xs text-on-surface-variant">{email}</p>
            <p className="text-xs text-on-surface-variant/60 mt-1">{memberStr}</p>
          </div>
          <div className="flex gap-2">
            {avatar && (
              <button
                onClick={handleAvatarRemove}
                disabled={uploading}
                className="text-xs text-on-surface-variant hover:text-on-surface border border-outline-variant rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
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

/* ─── Company Details ────────────────────────────────────── */

function CompanySection({
  initialRegNo,
  initialAddress,
  initialStampUrl,
}: {
  initialRegNo: string | null;
  initialAddress: string | null;
  initialStampUrl: string | null;
}) {
  const [regNo, setRegNo] = useState(initialRegNo ?? "");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [stampUrl, setStampUrl] = useState<string | null>(initialStampUrl);
  const [saving, setSaving] = useState(false);
  const [stampUploading, setStampUploading] = useState(false);
  const stampFileRef = useRef<HTMLInputElement>(null);

  const isDirty = regNo !== (initialRegNo ?? "") || address !== (initialAddress ?? "");

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyRegistrationNo: regNo.trim() || null,
        companyAddress: address.trim() || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to update company details.");
      return;
    }
    toast.success("Company details updated.");
  }

  async function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File must be under 2MB.");
      return;
    }

    setStampUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/settings/stamp", {
      method: "POST",
      body: formData,
    });
    setStampUploading(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Failed to upload stamp.");
      return;
    }

    const data = await res.json();
    setStampUrl(data.stampImageUrl);
    toast.success("Company stamp updated.");
  }

  async function handleStampRemove() {
    setStampUploading(true);
    const res = await fetch("/api/settings/stamp", { method: "DELETE" });
    setStampUploading(false);

    if (!res.ok) {
      toast.error("Failed to remove stamp.");
      return;
    }

    setStampUrl(null);
    toast.success("Company stamp removed.");
  }

  const inputClass =
    "w-full border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  return (
    <section>
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-4">
        Company Details
      </h2>
      <p className="text-xs text-on-surface-variant mb-4">
        These details appear on generated payslip PDFs. All fields are optional.
      </p>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            Registration Number
          </label>
          <input
            type="text"
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="e.g. 202401013061"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
            Company Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={"NO 1 GF, JALAN SEROJA JAYA 1\nTAMAN SEROJA JAYA 28380 KEMAYAN PAHANG"}
            rows={3}
            className={inputClass + " resize-none"}
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Company Stamp */}
        <div className="border-t border-outline-variant/20 pt-5 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Company Stamp</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Shown in the &quot;Approved By&quot; section of payslip PDFs.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {stampUrl ? (
              <div className="relative group">
                <img
                  src={stampUrl}
                  alt="Company stamp"
                  className="w-20 h-20 object-contain rounded-md border border-outline-variant/30"
                />
                <button
                  onClick={handleStampRemove}
                  disabled={stampUploading}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-critical text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => stampFileRef.current?.click()}
                disabled={stampUploading}
                className="w-20 h-20 border-2 border-dashed border-outline-variant/50 rounded-md flex flex-col items-center justify-center gap-1 text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                <Upload size={16} />
                <span className="text-[10px]">Upload</span>
              </button>
            )}
            {stampUrl && (
              <button
                onClick={() => stampFileRef.current?.click()}
                disabled={stampUploading}
                className="text-xs text-on-surface-variant hover:text-on-surface border border-outline-variant rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50"
              >
                {stampUploading ? "Uploading..." : "Replace"}
              </button>
            )}
          </div>
          <input
            ref={stampFileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleStampUpload}
            className="hidden"
          />
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

  const isGoogleLinked = connectedProviders.includes("google");

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
              onClick={isGoogleLinked ? undefined : () => signIn("google", { redirectTo: "/settings" })}
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
