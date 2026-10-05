"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startTour } from "./product-tour";

export function DemoBanner() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/onboarding", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirming(false);
    if (!res?.ok) {
      toast.error("Couldn't remove the sample data. Please try again.");
      return;
    }
    toast.success("Sample data removed");
    router.refresh();
  }

  return (
    <div
      data-tour="demo-banner"
      className="shrink-0 bg-brand/10 px-4 lg:px-16 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.82rem] text-on-surface"
    >
      <p className="min-w-0">
        <span className="font-semibold">You&apos;re viewing sample data</span>{" "}
        <span className="text-on-surface-variant">
          (branch DEMO01). It&apos;s removed automatically when you upload your first file.
        </span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={startTour}
          className="px-3 py-1.5 font-medium text-brand hover:bg-brand/10 rounded-[0.375rem]"
        >
          Take the tour
        </button>
        {confirming ? (
          <>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="px-3 py-1.5 font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="px-3 py-1.5 font-medium text-white bg-critical hover:bg-critical/90 rounded-[0.375rem] disabled:opacity-60"
            >
              {busy ? "Removing…" : "Yes, remove it"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="px-3 py-1.5 font-medium text-on-surface bg-white hover:bg-surface-hover rounded-[0.375rem]"
          >
            Remove sample data
          </button>
        )}
      </div>
    </div>
  );
}
