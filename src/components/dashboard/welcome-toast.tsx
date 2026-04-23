"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Module-level guard: survives React strict-mode double invocation in dev and
// layout re-renders in prod. Resets naturally on full page load (after OAuth
// redirect, manual URL visit, etc.).
let hasFired = false;

function WelcomeToastInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hasFired) return;
    if (searchParams.get("welcome") !== "1") return;
    hasFired = true;

    toast.success("Welcome back, you're now logged in", {
      id: "welcome-back",
      className: "toast-success-green",
    });

    // Strip the param so refresh / bfcache restore doesn't re-trigger the check
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return null;
}

export function WelcomeToast() {
  return (
    <Suspense fallback={null}>
      <WelcomeToastInner />
    </Suspense>
  );
}
