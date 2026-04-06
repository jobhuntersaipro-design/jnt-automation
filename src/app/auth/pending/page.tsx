import Link from "next/link";

export default function PendingPage() {
  return (
    <div className="bg-surface-container-lowest rounded-lg shadow p-10 flex flex-col items-center gap-6 w-full max-w-sm text-center">
      <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-2xl">
        ⏳
      </div>
      <div>
        <h1 className="font-manrope font-semibold text-2xl text-on-surface">
          Awaiting approval
        </h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Your account is pending approval. You&apos;ll be notified once access
          is granted.
        </p>
      </div>
      <Link
        href="/auth/login"
        className="text-sm text-primary hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
