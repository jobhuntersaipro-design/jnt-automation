"use client";

import { useEffect } from "react";

/**
 * Handles browser bfcache restoration — when the browser freezes the JS heap
 * on navigate-away and restores it on back, `pageshow` with `e.persisted`
 * fires and we do a hard reload to get a fresh React tree.
 */
export function BfcacheFix() {
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
