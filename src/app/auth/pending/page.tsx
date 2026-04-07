import Link from "next/link";
import { Clock } from "lucide-react";

export default function PendingPage() {
  return (
    <div className="flex flex-col items-center gap-6 text-center max-w-sm">
      <div className="w-14 h-14 rounded-full bg-surface-hover flex items-center justify-center">
        <Clock size={28} className="text-on-surface-variant" />
      </div>
      <div>
        <h1 className="font-manrope font-semibold text-2xl text-on-surface">
          Account pending approval
        </h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Your account has been created. We&apos;ll review it and get back to
          you shortly.
        </p>
      </div>
      <p className="text-xs text-on-surface-variant">
        Questions? Email us at{" "}
        <a
          href="mailto:help@easystaff.top"
          className="text-primary hover:underline"
        >
          help@easystaff.top
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
