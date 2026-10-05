"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const START_EVENT = "easystaff:start-tour";
const STORAGE_KEY = "easystaff:tour-step";

/** Restart the tour from anywhere (account menu, demo banner). */
export function startTour() {
  window.dispatchEvent(new Event(START_EVENT));
}

interface Step {
  path: string;
  /** `data-tour` value to spotlight. Missing/hidden target → centered card. */
  target?: string;
  title: string;
  body: string;
  demoOnly?: boolean;
}

const STEPS: Step[] = [
  {
    path: "/dashboard",
    title: "Welcome to EasyStaff",
    body: "Here's a quick tour of the main pages. It takes about a minute, and you can replay it from the account menu.",
  },
  {
    path: "/dashboard",
    target: "demo-banner",
    title: "Sample data to explore",
    body: "We've loaded 6 months of sample payroll for a branch called DEMO01. Click around, edit and recalculate. Nothing here is real.",
    demoOnly: true,
  },
  {
    path: "/dashboard",
    target: "overview-summary",
    title: "Your payroll at a glance",
    body: "Total net payout, headcount and average salaries, compared with the previous period.",
  },
  {
    path: "/dashboard",
    target: "overview-filters",
    title: "Filter by branch and period",
    body: "Narrow every card and chart on this page to specific branches or a date range.",
  },
  {
    path: "/dispatchers",
    target: "upload-zone",
    title: "Upload your monthly J&T file",
    body: "Drop the delivery export (.xlsx) here. Branch, month and dispatchers are detected automatically, then salaries are calculated for you to review.",
  },
  {
    path: "/dispatchers",
    target: "payroll-history",
    title: "Payroll history",
    body: "Every saved month lives here. Open one to adjust penalties and advances, generate payslips, or export PDF and CSV.",
  },
  {
    path: "/dispatchers",
    target: "dispatchers-settings-tab",
    title: "Per-dispatcher rates",
    body: "The Settings tab is where you set each dispatcher's weight-tier rates, bonus tiers and petrol subsidy.",
  },
  {
    path: "/staff",
    target: "staff-tabs",
    title: "Staff payroll",
    body: "Supervisors, admins, store keepers and drivers. Pick a month, enter pay, and EPF, SOCSO and EIS are calculated for you. Add people in the Settings tab.",
  },
  {
    path: "/staff",
    target: "demo-banner",
    title: "Ready for your own data?",
    body: "Remove the sample data here whenever you like. It's also removed automatically when you upload your first file.",
    demoOnly: true,
  },
];

function readSavedStep(): number | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveStep(index: number | null) {
  try {
    if (index === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    // Storage blocked (private mode) — the tour just won't resume after a reload.
  }
}

export function ProductTour({ autoStart, hasDemo }: { autoStart: boolean; hasDemo: boolean }) {
  const steps = STEPS.filter((s) => hasDemo || !s.demoOnly);
  const [index, setIndex] = useState<number | null>(null);
  // Rect is keyed by step so a stale highlight from the previous step never shows.
  const [spot, setSpot] = useState<{ index: number; rect: DOMRect } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const step = index !== null ? steps[index] : undefined;

  // Start: resume a tour interrupted by a reload, else auto-start for new agents.
  useEffect(() => {
    const saved = readSavedStep();
    const initial = saved !== null && saved < steps.length ? saved : autoStart ? 0 : null;
    const onStart = () => setIndex(0);
    window.addEventListener(START_EVENT, onStart);
    // Deferred so the setState isn't synchronous inside the effect body.
    const t = setTimeout(() => initial !== null && setIndex(initial), 0);
    return () => {
      window.removeEventListener(START_EVENT, onStart);
      clearTimeout(t);
    };
  }, [autoStart, steps.length]);

  useEffect(() => saveStep(index), [index]);

  // Go to the step's page, then find + follow its target.
  useEffect(() => {
    if (!step || index === null) return;
    if (pathname !== step.path) {
      router.push(step.path);
      return;
    }
    if (!step.target) return;

    let el: Element | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => el && setSpot({ index, rect: el.getBoundingClientRect() });
    const find = () => {
      const candidate = document.querySelector(`[data-tour="${step.target}"]`);
      // Width 0 = hidden at this breakpoint; fall back to a centered card.
      if (candidate && candidate.getBoundingClientRect().width > 0) {
        el = candidate;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        update();
      } else if (++tries < 100) {
        timer = setTimeout(find, 100); // streamed content can take a moment
      }
    };
    find();
    // Capture phase so scrolling inside page-level scroll containers counts too.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step, index, pathname, router]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function finish() {
    setIndex(null);
    setSpot(null);
    fetch("/api/onboarding", { method: "POST" }).catch(() => {});
  }

  if (!step || index === null) return null;

  const rect = spot?.index === index ? spot.rect : null;
  const pad = 6;
  const isLast = index === steps.length - 1;
  const cardPosition = !rect
    ? "top-1/2 -translate-y-1/2"
    : rect.top + rect.height / 2 > window.innerHeight / 2
      ? "top-20"
      : "bottom-6";

  return (
    <div className="fixed inset-0 z-100" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="absolute rounded-lg ring-2 ring-brand transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(25, 28, 29, 0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-on-surface/55" />
      )}

      <div
        className={`absolute left-4 right-4 sm:left-1/2 sm:right-auto sm:w-104 sm:-translate-x-1/2 ${cardPosition} bg-white rounded-xl p-5 shadow-[0_12px_40px_-12px_rgba(25,28,29,0.3)]`}
      >
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.05em] text-on-surface-variant">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-[1.05rem] font-semibold text-on-surface font-(family-name:--font-manrope)">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-on-surface-variant">{step.body}</p>

        <div className="mt-4 flex items-center gap-2">
          {!isLast && (
            <button
              onClick={finish}
              className="px-2 py-2 text-[0.82rem] font-medium text-on-surface-variant hover:text-on-surface"
            >
              Skip tour
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {index > 0 && (
              <button
                onClick={() => setIndex(index - 1)}
                className="px-4 py-2 text-[0.84rem] font-medium text-on-surface-variant hover:bg-surface-hover rounded-[0.375rem]"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setIndex(index + 1))}
              autoFocus
              className="px-4 py-2 text-[0.84rem] font-medium text-white bg-brand hover:bg-brand/90 rounded-[0.375rem]"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
