"use client";

import { useState } from "react";
import { mockPetrolEligibilityRate } from "@/lib/mock-data";

export function PetrolEligibility() {
  const [hovered, setHovered] = useState<{ month: string; rate: number; x: number; y: number } | null>(null);

  const latest = mockPetrolEligibilityRate[mockPetrolEligibilityRate.length - 1];
  const max = Math.max(...mockPetrolEligibilityRate.map((d) => d.rate));
  const min = Math.min(...mockPetrolEligibilityRate.map((d) => d.rate));
  const range = max - min || 1;

  const W = 280;
  const H = 68;
  const pad = 8;

  const coords = mockPetrolEligibilityRate.map((d, i) => ({
    x: pad + (i / (mockPetrolEligibilityRate.length - 1)) * (W - pad * 2),
    y: pad + ((max - d.rate) / range) * (H - pad * 2),
    ...d,
  }));

  const points = coords.map((c) => `${c.x},${c.y}`).join(" ");

  // Convert SVG coordinate space to CSS percentages for HTML tooltip positioning
  const tooltipLeft = hovered ? `${((hovered.x / W) * 100).toFixed(2)}%` : "0";
  const tooltipTop = hovered ? `${((hovered.y / H) * 100).toFixed(2)}%` : "0";

  // Percentage padding to align HTML labels with SVG data points
  const labelPad = `${((pad / W) * 100).toFixed(2)}%`;

  return (
    <div className="bg-white rounded-[0.75rem] p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-heading font-semibold text-[1rem] text-on-surface">
          Petrol Subsidy Eligibility Rate
        </h2>
        <p className="text-[0.75rem] text-on-surface-variant mt-0.5">
          % of dispatchers meeting ≥70 daily orders threshold
        </p>
      </div>

      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <p
            className="font-heading font-bold text-on-surface tabular-nums leading-none"
            style={{ fontSize: "2.5rem", letterSpacing: "-0.02em" }}
          >
            {latest.rate.toFixed(2)}%
          </p>
          <p className="text-[0.75rem] text-on-surface-variant mt-1">{latest.month} · latest month</p>
        </div>

        {/* Chart: relative wrapper so HTML tooltip can be positioned over the SVG */}
        <div className="flex-1 min-w-0">
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full block"
              style={{ aspectRatio: `${W} / ${H}` }}
            >
              <polyline
                points={points}
                fill="none"
                stroke="#0056D2"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {coords.map((c) => {
                const isLast = c.month === latest.month;
                const isHovered = hovered?.month === c.month;
                return (
                  <circle
                    key={c.month}
                    cx={c.x}
                    cy={c.y}
                    r={isLast || isHovered ? 4.5 : 3.5}
                    fill={isLast || isHovered ? "#0056D2" : "#ffffff"}
                    stroke="#0056D2"
                    strokeWidth="1.5"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHovered({ month: c.month, rate: c.rate, x: c.x, y: c.y })}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>

            {/* HTML tooltip — fixed CSS size, positioned using percentage coords */}
            {hovered && (
              <div
                className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full -mt-1.5 bg-on-surface text-white text-[0.9rem] font-medium px-2 py-1 rounded-lg whitespace-nowrap"
                style={{ left: tooltipLeft, top: tooltipTop }}
              >
                {hovered.month} · {hovered.rate.toFixed(2)}%
              </div>
            )}
          </div>

          {/* HTML labels: fixed CSS size (not affected by SVG scaling), padded to align with data points */}
          <div
            className="flex justify-between mt-0.5"
            style={{ paddingLeft: labelPad, paddingRight: labelPad }}
          >
            {mockPetrolEligibilityRate.map((d) => (
              <span key={d.month} className="text-[0.5rem] leading-none text-on-surface-variant">
                {d.month}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[0.7rem] text-on-surface-variant/60 text-center mt-1">
        Chart component — Phase 2
      </p>
    </div>
  );
}
