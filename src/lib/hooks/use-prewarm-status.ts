import { useEffect, useRef, useState } from "react";

export type PrewarmStatus = "idle" | "queued" | "running" | "done" | "failed";

export type PrewarmStage = "queued" | "generating" | "finalizing" | "done";

export interface PrewarmStatusResponse {
  status: PrewarmStatus;
  /**
   * Fine-grained stage during `status === "running"`. Lets the UI
   * distinguish "Generating 47/100" from "Bundling ZIP…" — otherwise
   * the counter plateaus at 100 % while finalize runs and it looks stuck.
   */
  stage?: PrewarmStage;
  total?: number;
  done?: number;
  totalChunks?: number;
  doneChunks?: number;
  reason?: string;
  error?: string;
  startedAt?: number;
  updatedAt?: number;
}

/**
 * Poll `/api/payroll-cache/status?year=Y&month=M` to drive the Payroll
 * page's per-row "Preparing downloads…" indicator.
 *
 * Cadence is adaptive: 2 s while `status === "running"` so users see the
 * counter tick, 10 s otherwise (which covers "done" and "idle" — the
 * common steady states — so we're not hammering the endpoint).
 *
 * `enabled` lets callers pause polling when the row is off-screen or the
 * payroll-history table is filtered down to exclude this month.
 */
export function usePrewarmStatus(
  year: number,
  month: number,
  opts: { enabled?: boolean } = {},
): PrewarmStatusResponse {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<PrewarmStatusResponse>({ status: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `/api/payroll-cache/status?year=${year}&month=${month}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as PrewarmStatusResponse;
        if (!cancelled) setState(data);
      } catch {
        // transient — retry next tick
      }
    };

    const loop = async () => {
      if (cancelled) return;
      await fetchOnce();
      if (cancelled) return;
      // Read current state at scheduling time, not capture time.
      setState((current) => {
        const delay = current.status === "running" ? 2_000 : 10_000;
        timeoutRef.current = setTimeout(loop, delay);
        return current;
      });
    };

    loop();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [year, month, enabled]);

  return state;
}
