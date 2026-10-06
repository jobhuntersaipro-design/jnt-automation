import Link from "next/link";
import { Lock } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/support";

export default function PendingPage() {
  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-sm">
      <div className="w-14 h-14 rounded-full bg-surface-hover flex items-center justify-center">
        <Lock size={28} className="text-on-surface-variant" />
      </div>
      <div>
        <h1 className="font-manrope font-semibold text-2xl text-on-surface">
          Account disabled
        </h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Your EasyStaff account is currently disabled, usually because a
          subscription payment is outstanding. Your data is safe — contact us
          to settle the invoice and we&apos;ll switch your account back on.
        </p>
      </div>
      <p className="text-xs text-on-surface-variant">
        Email us at{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-primary hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
      </p>
      <Link
        href="/auth/login"
        className="text-sm text-primary hover:underline"
      >
        &larr; Back to sign in
      </Link>
    </div>
  );
}
