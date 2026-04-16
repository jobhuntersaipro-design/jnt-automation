"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  getStepsForPath,
  getPageSequence,
  type TutorialStep,
} from "@/lib/tutorial/steps";

interface TutorialOverlayProps {
  hasSeenTutorial: boolean;
  isSuperAdmin: boolean;
}

function clampPosition(
  pos: { top: number; left: number },
  tooltipWidth: number,
  tooltipHeight: number,
) {
  const margin = 12;
  return {
    top: Math.max(margin, Math.min(pos.top, window.innerHeight + window.scrollY - tooltipHeight - margin)),
    left: Math.max(margin, Math.min(pos.left, window.innerWidth - tooltipWidth - margin)),
  };
}

function getTooltipPosition(
  rect: DOMRect,
  placement: TutorialStep["placement"],
  tooltipWidth: number,
  tooltipHeight: number,
) {
  const gap = 12;
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  let pos: { top: number; left: number };

  switch (placement) {
    case "bottom":
      pos = {
        top: rect.bottom + scrollY + gap,
        left: rect.left + scrollX + rect.width / 2 - tooltipWidth / 2,
      };
      break;
    case "top":
      pos = {
        top: rect.top + scrollY - tooltipHeight - gap,
        left: rect.left + scrollX + rect.width / 2 - tooltipWidth / 2,
      };
      break;
    case "left":
      pos = {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.left + scrollX - tooltipWidth - gap,
      };
      break;
    case "right":
      pos = {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + scrollX + gap,
      };
      break;
  }

  return clampPosition(pos, tooltipWidth, tooltipHeight);
}

export function TutorialOverlay({ hasSeenTutorial, isSuperAdmin }: TutorialOverlayProps) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  // Track which pages have been completed this session
  const [seenPages, setSeenPages] = useState<Set<string>>(new Set());

  const pages = getPageSequence(isSuperAdmin);
  const steps = useMemo(() => getStepsForPath(pathname, isSuperAdmin), [pathname, isSuperAdmin]);

  // Determine the canonical page path for tracking
  const pagePath = useMemo(() => {
    const page = pages.find((p) => pathname.startsWith(p.path));
    return page?.path ?? pathname;
  }, [pathname, pages]);

  // Reset and auto-activate when pathname changes to a new unseen page
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setTargetRect(null);
    setCurrentStep(0);
    if (!hasSeenTutorial && !seenPages.has(pagePath) && steps.length > 0) {
      setActive(true);
    }
  }

  // Activate tutorial on initial mount if not seen
  useEffect(() => {
    if (!hasSeenTutorial && !seenPages.has(pagePath) && steps.length > 0) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial, pagePath, seenPages, steps.length]);

  const handleDismiss = useCallback(async () => {
    setActive(false);
    setTargetRect(null);

    // Mark this page as seen
    setSeenPages((prev) => {
      const next = new Set(prev);
      next.add(pagePath);

      // If all pages have been seen, persist to DB
      const allPagePaths = pages.map((p) => p.path);
      const allSeen = allPagePaths.every((p) => next.has(p));
      if (allSeen) {
        fetch("/api/tutorial", { method: "POST" }).catch(() => {});
      }

      return next;
    });
  }, [pagePath, pages]);

  // Find and highlight current target element
  useEffect(() => {
    if (!active || steps.length === 0) return;

    const step = steps[currentStep];
    if (!step) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => {
          if (cancelled) return;
          setTargetRect(el.getBoundingClientRect());
        }, 350);
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryFind, 200);
      }
    };

    setTimeout(tryFind, 100);
    return () => { cancelled = true; };
  }, [active, steps, currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleDismiss();
    }
  }, [currentStep, steps.length, handleDismiss]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  if (!active || steps.length === 0) return null;

  // While searching for target, show just the backdrop (non-dismissing)
  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-9999" style={{ pointerEvents: "auto" }}>
        <div className="absolute inset-0 bg-on-surface/30 transition-opacity duration-300" />
      </div>
    );
  }

  const step = steps[currentStep];
  const tooltipWidth = 320;
  const tooltipHeight = 180;
  const pos = getTooltipPosition(targetRect, step.placement, tooltipWidth, tooltipHeight);

  const pad = 8;
  const rawTop = targetRect.top - pad;
  const rawLeft = targetRect.left - pad;
  const rawWidth = targetRect.width + pad * 2;
  const rawHeight = targetRect.height + pad * 2;
  const highlightStyle = {
    top: Math.max(0, rawTop),
    left: Math.max(0, rawLeft),
    width: rawLeft < 0 ? rawWidth + rawLeft : rawWidth,
    height: rawTop < 0 ? rawHeight + rawTop : rawHeight,
  };

  const isLastStep = currentStep >= steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className="fixed inset-0 z-9999" style={{ pointerEvents: "auto" }}>
      {/* Backdrop — clicking does NOT dismiss */}
      <div className="absolute inset-0 bg-on-surface/50 transition-opacity duration-300" />

      {/* Highlight ring */}
      <div
        className="absolute rounded-lg border-2 border-white shadow-[0_0_0_9999px_rgba(25,28,29,0.5)] transition-all duration-300"
        style={{ ...highlightStyle, pointerEvents: "none" }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-xl shadow-[0_12px_40px_-12px_rgba(25,28,29,0.2)] p-5 transition-all duration-300"
        style={{
          top: pos.top,
          left: pos.left,
          width: tooltipWidth,
          zIndex: 10000,
        }}
      >
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <X size={14} />
        </button>

        {/* Step counter */}
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.05em] text-primary mb-1.5">
          Step {currentStep + 1} of {steps.length}
        </p>

        <h3 className="font-heading font-semibold text-[1rem] text-on-surface mb-1.5">
          {step.title}
        </h3>
        <p className="text-[0.82rem] text-on-surface-variant leading-relaxed mb-4">
          {step.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleDismiss}
            className="text-[0.77rem] font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-[0.77rem] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-1.5 text-[0.77rem] font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
            >
              {isLastStep ? "Done" : "Next"}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentStep
                  ? "bg-primary"
                  : i < currentStep
                    ? "bg-primary/40"
                    : "bg-outline-variant/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
