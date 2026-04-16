export interface TutorialStep {
  /** CSS selector for the target element to highlight */
  target: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description text */
  description: string;
  /** Preferred tooltip placement */
  placement: "top" | "bottom" | "left" | "right";
}

export const OVERVIEW_STEPS: TutorialStep[] = [
  {
    target: "[data-tutorial='charts']",
    title: "Charts",
    description: "Track monthly salary trends and branch performance here.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='filters']",
    title: "Filters",
    description: "Filter by branch or date range to narrow down the data.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='dispatcher-table']",
    title: "Dispatcher Performance",
    description: "See individual dispatcher performance ranked by net salary.",
    placement: "top",
  },
  {
    target: "[data-tutorial='export']",
    title: "Export",
    description: "Export dispatcher data to CSV or Google Sheets.",
    placement: "left",
  },
];

export const STAFF_STEPS: TutorialStep[] = [
  {
    target: "[data-tutorial='dispatcher-list']",
    title: "Dispatcher List",
    description: "All your dispatchers are listed here — search or filter by branch.",
    placement: "top",
  },
  {
    target: "[data-tutorial='defaults-button']",
    title: "Defaults",
    description: "Set default salary rules that apply to all new dispatchers automatically.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='dispatcher-settings']",
    title: "Inline Settings",
    description: "Edit weight tiers, incentive, and petrol rules directly in the table.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='history-tab']",
    title: "History",
    description: "View and edit past month settings per dispatcher.",
    placement: "left",
  },
];

export const PAYROLL_STEPS: TutorialStep[] = [
  {
    target: "[data-tutorial='upload-zone']",
    title: "Upload",
    description: "Upload your monthly J&T delivery file here to start calculating salaries.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='payslips']",
    title: "Generate Payslips",
    description: "After confirming, select dispatchers and download payslips as PDF.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='recalculate']",
    title: "Edit & Recalculate",
    description: "If J&T sends penalty notices late, use this to update and regenerate.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='payroll-history']",
    title: "Payroll History",
    description: "Access any past confirmed month here to view, export, or regenerate payslips.",
    placement: "top",
  },
];

export interface TutorialPage {
  path: string;
  label: string;
  steps: TutorialStep[];
}

export function getPageSequence(isSuperAdmin: boolean): TutorialPage[] {
  // Admin tutorial removed — not needed
  void isSuperAdmin;
  return [
    { path: "/dashboard", label: "Overview", steps: OVERVIEW_STEPS },
    { path: "/staff", label: "Staff", steps: STAFF_STEPS },
    { path: "/payroll", label: "Payroll", steps: PAYROLL_STEPS },
  ];
}

export function getStepsForPath(path: string, _isSuperAdmin: boolean): TutorialStep[] {
  if (path.startsWith("/dashboard")) return OVERVIEW_STEPS;
  if (path.startsWith("/staff")) return STAFF_STEPS;
  if (path.startsWith("/payroll")) return PAYROLL_STEPS;
  return [];
}

export function getPageIndexForPath(path: string, isSuperAdmin: boolean): number {
  const pages = getPageSequence(isSuperAdmin);
  return pages.findIndex((p) => path.startsWith(p.path));
}
