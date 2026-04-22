import { getBranchColor } from "@/lib/branch-colors";

type BranchChipSize = "sm" | "md";
type BranchChipVariant = "solid" | "muted" | "dot";

interface BranchChipProps {
  code: string;
  /** sm = dense table cells (default), md = larger standalone labels */
  size?: BranchChipSize;
  /**
   * solid (default) — full branch color fill
   * muted   — neutral grey chip with a small branch-color dot (for secondary
   *           assignments when the row already highlights a primary)
   * dot     — inline bullet + text, for legends and tight headers
   */
  variant?: BranchChipVariant;
  title?: string;
  className?: string;
}

const SIZE_CHIP: Record<BranchChipSize, string> = {
  sm: "px-1.5 py-0.5 text-[0.7rem]",
  md: "px-2 py-0.5 text-[0.72rem]",
};

const SIZE_DOT: Record<BranchChipSize, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
};

/**
 * Canonical branch label. Always resolves color through `getBranchColor`
 * so the same code looks identical across the Branch Distribution chart,
 * dispatcher assignment chips, salary history rows, and payroll history.
 */
export function BranchChip({
  code,
  size = "sm",
  variant = "solid",
  title,
  className = "",
}: BranchChipProps) {
  const c = getBranchColor(code);
  const hoverTitle = title ?? (code ? `Branch ${code}` : undefined);

  if (variant === "dot") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium tabular-nums text-on-surface-variant ${SIZE_CHIP[size]} ${className}`}
        title={hoverTitle}
      >
        <span
          aria-hidden
          className={`rounded-full ${SIZE_DOT[size]}`}
          style={{ backgroundColor: c.hexSolid }}
        />
        {code || "—"}
      </span>
    );
  }

  if (variant === "muted") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium tabular-nums bg-surface-low text-on-surface-variant rounded-md ring-1 ring-inset ring-outline-variant/30 ${SIZE_CHIP[size]} ${className}`}
        title={hoverTitle}
      >
        <span
          aria-hidden
          className={`rounded-full ${SIZE_DOT[size]}`}
          style={{ backgroundColor: c.hexSolid }}
        />
        {code || "—"}
      </span>
    );
  }

  // solid (default)
  return (
    <span
      className={`inline-flex items-center font-medium tabular-nums rounded-md ring-1 ring-inset ${c.bg} ${c.text} ${c.ring} ${SIZE_CHIP[size]} ${className}`}
      title={hoverTitle}
    >
      {code || "—"}
    </span>
  );
}
