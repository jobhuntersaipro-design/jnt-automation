/**
 * Unified branch color system.
 *
 * Every place that renders a branch code in the app — chart bars, chips on
 * dispatcher rows, salary-history labels, payroll history — resolves its
 * color through this module so a given branch reads as the same visual unit
 * end-to-end.
 *
 * Palette intentionally excludes the app's brand blue (#0056D2) to keep
 * branch chips from competing with primary action affordances.
 *
 * All bg/text pairings meet WCAG AA for normal text (≥4.5:1 contrast).
 */

export interface BranchColor {
  /** Palette slot id (for debug + deterministic tests) */
  id: string;
  /** Tailwind chip classes (light bg + dark text + hairline ring) */
  bg: string;
  text: string;
  ring: string;
  /** Hex values for canvas/SVG contexts (Recharts, inline styles, etc.) */
  hexBg: string;
  hexText: string;
  hexSolid: string;
}

const PALETTE: readonly BranchColor[] = [
  {
    id: "teal",
    bg: "bg-teal-100",
    text: "text-teal-700",
    ring: "ring-teal-200",
    hexBg: "#CCFBF1",
    hexText: "#0F766E",
    hexSolid: "#14B8A6",
  },
  {
    id: "amber",
    bg: "bg-amber-100",
    text: "text-amber-700",
    ring: "ring-amber-200",
    hexBg: "#FEF3C7",
    hexText: "#B45309",
    hexSolid: "#F59E0B",
  },
  {
    id: "rose",
    bg: "bg-rose-100",
    text: "text-rose-700",
    ring: "ring-rose-200",
    hexBg: "#FFE4E6",
    hexText: "#BE123C",
    hexSolid: "#F43F5E",
  },
  {
    id: "purple",
    bg: "bg-purple-100",
    text: "text-purple-800",
    ring: "ring-purple-200",
    hexBg: "#F3E8FF",
    hexText: "#6B21A8",
    hexSolid: "#A855F7",
  },
  {
    id: "sky",
    bg: "bg-sky-100",
    text: "text-sky-700",
    ring: "ring-sky-200",
    hexBg: "#E0F2FE",
    hexText: "#0369A1",
    hexSolid: "#0EA5E9",
  },
  {
    id: "emerald",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    hexBg: "#D1FAE5",
    hexText: "#047857",
    hexSolid: "#10B981",
  },
  {
    id: "orange",
    bg: "bg-orange-100",
    text: "text-orange-700",
    ring: "ring-orange-200",
    hexBg: "#FFEDD5",
    hexText: "#C2410C",
    hexSolid: "#F97316",
  },
  {
    id: "indigo",
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    ring: "ring-indigo-200",
    hexBg: "#E0E7FF",
    hexText: "#3730A3",
    hexSolid: "#6366F1",
  },
];

/**
 * Fallback for empty/null codes — muted neutral, shares the same footprint
 * so callers don't need to branch on the code presence.
 */
const FALLBACK: BranchColor = {
  id: "neutral",
  bg: "bg-surface-low",
  text: "text-on-surface-variant",
  ring: "ring-outline-variant/30",
  hexBg: "#f3f4f5",
  hexText: "#424654",
  hexSolid: "#9ca3af",
};

/**
 * Deterministic djb2-style hash so a given branch code always maps to the
 * same palette slot — same result on server + client, same across sessions.
 */
function hashCode(code: string): number {
  let h = 5381;
  for (let i = 0; i < code.length; i++) {
    h = (h * 33) ^ code.charCodeAt(i);
  }
  return h >>> 0;
}

export function getBranchColor(code: string | null | undefined): BranchColor {
  if (!code) return FALLBACK;
  return PALETTE[hashCode(code) % PALETTE.length];
}

export { PALETTE as BRANCH_PALETTE };
