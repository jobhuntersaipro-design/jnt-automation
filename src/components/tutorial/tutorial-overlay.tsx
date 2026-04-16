"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  getStepsForPath,
  getPageSequence,
  getPageIndexForPath,
  type TutorialStep,
} from "@/lib/tutorial/steps";

interface TutorialOverlayProps {
  hasSeenTutorial: boolean;
  isSuperAdmin: boolean;
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

  switch (placement) {
    case "bottom":
      return {
        top: rect.bottom + scrollY + gap,
        left: Math.max(8, rect.left + scrollX + rect.width / 2 - tooltipWidth / 2),
      };
    case "top":
      return {
        top: rect.top + scrollY - tooltipHeight - gap,
        left: Math.max(8, rect.left + scrollX + rect.width / 2 - tooltipWidth / 2),
      };
    case "left":
      return {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.left + scrollX - tooltipWidth - gap,
      };
    case "right":
      return {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + scrollX + gap,
      };
  }
}

export function TutorialOverlay({ hasSeenTutorial, isSuperAdmin }: TutorialOverlayProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Track which page in the sequence we navigated to, so we can compute global step index
  const pageIndexRef = useRef(0);

  const pages = getPageSequence(isSuperAdmin);
  const totalStepsAllPages = pages.reduce((sum, p) => sum + p.steps.length, 0);

  // Compute global step number (across all pages)
  const globalStepIndex = (() => {
    let count = 0;
    for (let i = 0; i < pageIndexRef.current; i++) {
      count += pages[i]?.steps.length ?? 0;
    }
    return count + currentStep;
  })();

  // Activate tutorial on first visit
  useEffect(() => {
    if (!hasSeenTutorial) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial]);

  // Update steps when path changes
  useEffect(() => {
    if (!active) return;
    const pageSteps = getStepsForPath(pathname, isSuperAdmin);
    const pageIdx = getPageIndexForPath(pathname, isSuperAdmin);
    if (pageIdx >= 0) pageIndexRef.current = pageIdx;
    setSteps(pageSteps);
    setCurrentStep(0);
    setTargetRect(null);
  }, [pathname, active, isSuperAdmin]);

  // Find and highlight current target
  useEffect(() => {
    if (!active || steps.length === 0) return;

    const step = steps[currentStep];
    if (!step) return;

    const findTarget = () => {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          setTargetRect(rect);
        }, 300);
      } else {
        // Target not found — skip this step
        if (currentStep < steps.length - 1) {
          setCurrentStep((s) => s + 1);
        } else {
          // All steps on this page exhausted, try next page
          navigateToNextPage();
        }
      }
    };

    findTarget();
  }, [active, steps, currentStep]);

  const handleDismiss = useCallback(async () => {
    setActive(false);
    setTargetRect(null);
    try {
      await fetch("/api/tutorial", { method: "POST" });
    } catch {
      // Silent fail
    }
  }, []);

  const navigateToNextPage = useCallback(() => {
    const currentPageIdx = pageIndexRef.current;
    if (currentPageIdx < pages.length - 1) {
      const nextPage = pages[currentPageIdx + 1];
      setTargetRect(null);
      router.push(nextPage.path);
      // pageIndexRef and steps will update via the pathname effect
    } else {
      // Last page done — finish tutorial
      handleDismiss();
    }
  }, [pages, router, handleDismiss]);

  const navigateToPrevPage = useCallback(() => {
    const currentPageIdx = pageIndexRef.current;
    if (currentPageIdx > 0) {
      const prevPage = pages[currentPageIdx - 1];
      setTargetRect(null);
      // We'll navigate and need to jump to the last step on that page
      // Set a flag so the pathname effect knows to go to the last step
      goToLastStepRef.current = true;
      router.push(prevPage.path);
    }
  }, [pages, router]);

  const goToLastStepRef = useRef(false);

  // Handle "go to last step" after navigating back
  useEffect(() => {
    if (goToLastStepRef.current && steps.length > 0) {
      goToLastStepRef.current = false;
      setCurrentStep(steps.length - 1);
    }
  }, [steps]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
      setTargetRect(null);
    } else {
      // Last step on this page — go to next page
      navigateToNextPage();
    }
  }, [currentStep, steps.length, navigateToNextPage]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setTargetRect(null);
    } else {
      // First step on this page — go back to previous page's last step
      navigateToPrevPage();
    }
  }, [currentStep, navigateToPrevPage]);

  if (!active || steps.length === 0 || !targetRect) return null;

  const step = steps[currentStep];
  const tooltipWidth = 320;
  const tooltipHeight = 160;
  const pos = getTooltipPosition(targetRect, step.placement, tooltipWidth, tooltipHeight);

  const pad = 8;
  const highlightStyle = {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  };

  const isLastStep = globalStepIndex >= totalStepsAllPages - 1;
  const isFirstStep = globalStepIndex === 0;

  // Current page label for context
  const currentPage = pages[pageIndexRef.current];

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-on-surface/50 transition-opacity duration-300" onClick={handleDismiss} />

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
          left: Math.min(pos.left, window.innerWidth - tooltipWidth - 16),
          width: tooltipWidth,
          zIndex: 10000,
        }}
      >
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors"
        >
          <X size={14} />
        </button>

        {/* Step counter */}
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.05em] text-brand mb-1.5">
          {currentPage?.label} &middot; Step {globalStepIndex + 1} of {totalStepsAllPages}
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
            Skip tutorial
          </button>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-[0.77rem] font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-low rounded-md transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-1.5 text-[0.77rem] font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors"
            >
              {isLastStep ? "Done" : "Next"}
            </button>
          </div>
        </div>

        {/* Progress dots — grouped by page */}
        <div className="flex items-center justify-center gap-1 mt-3">
          {pages.map((page, pi) => (
            <div key={pi} className="flex items-center gap-1">
              {pi > 0 && <div className="w-1 h-px bg-outline-variant/30 mx-0.5" />}
              {page.steps.map((_, si) => {
                const idx = pages.slice(0, pi).reduce((s, p) => s + p.steps.length, 0) + si;
                return (
                  <div
                    key={si}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      idx === globalStepIndex
                        ? "bg-brand"
                        : idx < globalStepIndex
                          ? "bg-brand/40"
                          : "bg-outline-variant/40"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
