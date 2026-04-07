"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Something went wrong.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow p-10 flex flex-col items-center gap-8 w-full max-w-sm">
      <Image src="/logo-square.png" alt="Logo" width={48} height={48} />
      <div className="text-center">
        <h1 className="font-manrope font-semibold text-2xl text-on-surface">
          Reset your password
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      {sent ? (
        <div className="text-center flex flex-col gap-3">
          <p className="text-sm text-on-surface">
            If an account exists with that email, we&apos;ve sent a password
            reset link. Check your inbox.
          </p>
          <Link
            href="/auth/login"
            className="text-sm text-primary hover:underline"
          >
            &larr; Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface bg-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-md py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 mt-1"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <p className="text-xs text-on-surface-variant">
            Remember your password?{" "}
            <Link
              href="/auth/login"
              className="text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
