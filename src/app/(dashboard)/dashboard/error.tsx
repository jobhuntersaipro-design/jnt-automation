"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard error]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <h2 className="font-heading font-semibold text-[1.2rem] text-on-surface">
          Something went wrong
        </h2>
        <p className="text-[0.84rem] text-on-surface-variant max-w-sm">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand rounded-[0.375rem] hover:bg-brand/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
