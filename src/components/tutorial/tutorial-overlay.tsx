"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { getStepsForPath, type TutorialStep } from "@/lib/tutorial/steps";

interface TutorialOverlayProps {
  hasSeenTutorial: boolean;
  isSuperAdmin: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowTop?: number;
  arrowLeft?: number;
  arrowDirection: "up" | "down" | "left" | "right";
}

function getTooltipPosition(
  rect: DOMRect,
  placement: TutorialStep["placement"],
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition {
  const gap = 12;
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  switch (placement) {
    case "bottom":
      return {
        top: rect.bottom + scrollY + gap,
        left: Math.max(8, rect.left + scrollX + rect.width / 2 - tooltipWidth / 2),
        arrowDirection: "up",
      };
    case "top":
      return {
        top: rect.top + scrollY - tooltipHeight - gap,
        left: Math.max(8, rect.left + scrollX + rect.width / 2 - tooltipWidth / 2),
        arrowDirection: "down",
      };
    case "left":
      return {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.left + scrollX - tooltipWidth - gap,
        arrowDirection: "right",
      };
    case "right":
      return {
        top: rect.top + scrollY + rect.height / 2 - tooltipHeight / 2,
        left: rect.right + scrollX + gap,
        arrowDirection: "left",
      };
  }
}

export function TutorialOverlay({ hasSeenTutorial, isSuperAdmin }: TutorialOverlayProps) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Activate tutorial on first visit
  useEffect(() => {
    if (!hasSeenTutorial) {
      // Small delay to let the page render targets
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial]);

  // Update steps when path changes
  useEffect(() => {
    if (!active) return;
    const pageSteps = getStepsForPath(pathname, isSuperAdmin);
    setSteps(pageSteps);
    setCurrentStep(0);
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
        // Small delay after scroll to get accurate position
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          setTargetRect(rect);
        }, 300);
      } else {
        // Target not found — skip this step
        if (currentStep < steps.length - 1) {
          setCurrentStep((s) => s + 1);
        } else {
          handleDismiss();
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
      // Silent fail — not critical
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
      setTargetRect(null);
    } else {
      handleDismiss();
    }
  }, [currentStep, steps.length, handleDismiss]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setTargetRect(null);
    }
  }, [currentStep]);

  if (!active || steps.length === 0 || !targetRect) return null;

  const step = steps[currentStep];
  const tooltipWidth = 320;
  const tooltipHeight = 160;
  const pos = getTooltipPosition(targetRect, step.placement, tooltipWidth, tooltipHeight);

  // Highlight cutout
  const pad = 8;
  const highlightStyle = {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  };

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Backdrop with cutout */}
      <div className="absolute inset-0 bg-on-surface/50 transition-opacity duration-300" onClick={handleDismiss} />

      {/* Highlight ring around target */}
      <div
        className="absolute rounded-lg border-2 border-white shadow-[0_0_0_9999px_rgba(25,28,29,0.5)] transition-all duration-300"
        style={{
          ...highlightStyle,
          pointerEvents: "none",
        }}
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
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-colors"
        >
          <X size={14} />
        </button>

        {/* Step counter */}
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.05em] text-brand mb-1.5">
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
            Skip tutorial
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
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
              {currentStep < steps.length - 1 ? "Next" : "Done"}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentStep ? "bg-brand" : i < currentStep ? "bg-brand/40" : "bg-outline-variant/40"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
