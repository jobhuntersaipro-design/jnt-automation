/**
 * Centralised color constants for Recharts components.
 * Recharts requires inline style/stroke/fill props — it cannot read Tailwind classes.
 * All values map to design system tokens defined in globals.css.
 */
export const CHART_COLORS = {
  brand: "#0056D2",         // --color-primary / --color-brand
  baseSalaryLine: "#38BDF8", // sky-blue secondary line (Net Payout vs Base Salary chart)
  success: "#10B981",       // positive MoM delta indicators
  critical: "#940002",      // --color-critical — negative MoM delta / errors
  bonusTierEarnings: "#12B981",     // bonusTierEarnings segment in Salary Breakdown
  petrolSubsidy: "#FBC024", // petrol subsidy segment in Salary Breakdown
  deductions: "#F43f5F",    // deductions/penalties segment in Salary Breakdown
  axisText: "#424654",      // --color-on-surface-variant — axis tick labels
  grid: "#f3f4f5",          // --color-surface-container-low — chart grid lines
  outlineVariant: "#c3c6d6", // --color-outline-variant — subdued legend text
} as const;
