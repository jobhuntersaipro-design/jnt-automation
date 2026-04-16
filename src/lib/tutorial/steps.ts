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
    target: "[data-tutorial='summary-cards']",
    title: "Summary Cards",
    description: "See your total payout, orders, and dispatcher count at a glance.",
    placement: "bottom",
  },
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
    description: "Export dispatcher performance including their salary settings to CSV or Google Sheets.",
    placement: "bottom",
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
    target: "[data-tutorial='pin-button']",
    title: "Pin Dispatchers",
    description: "Pin dispatchers that need special attention so they always appear at the top.",
    placement: "left",
  },
  {
    target: "[data-tutorial='dispatcher-settings']",
    title: "Settings",
    description: "Click any dispatcher to edit their individual salary rules.",
    placement: "left",
  },
  {
    target: "[data-tutorial='history-tab']",
    title: "History",
    description: "View and edit past month settings per dispatcher — useful for investigating salary differences.",
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
    target: "[data-tutorial='confirm-settings']",
    title: "Confirm Settings",
    description: "Always review staff settings before calculating — make sure rules are up to date.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='preview-table']",
    title: "Preview",
    description: "Review calculated salaries and enter any penalty or advance before confirming.",
    placement: "top",
  },
  {
    target: "[data-tutorial='confirm-save']",
    title: "Confirm & Save",
    description: "Once confirmed, salary records are locked and payslips can be generated.",
    placement: "top",
  },
  {
    target: "[data-tutorial='payslips']",
    title: "Generate Payslips",
    description: "Select dispatchers and download payslips as a ZIP file.",
    placement: "top",
  },
  {
    target: "[data-tutorial='recalculate']",
    title: "Edit & Recalculate",
    description: "If J&T sends penalty notices late, use this to update and regenerate.",
    placement: "top",
  },
  {
    target: "[data-tutorial='payroll-history']",
    title: "Payroll History",
    description: "Access any past confirmed month here to view, export, or regenerate payslips.",
    placement: "top",
  },
];

export const ADMIN_STEPS: TutorialStep[] = [
  {
    target: "[data-tutorial='agent-list']",
    title: "Agent List",
    description: "Approve new agents, set their branch limits, and manage access here.",
    placement: "bottom",
  },
  {
    target: "[data-tutorial='payment-history']",
    title: "Payment History",
    description: "Log manual payments per agent to track their subscription status.",
    placement: "bottom",
  },
];

export interface TutorialPage {
  path: string;
  label: string;
  steps: TutorialStep[];
}

export function getPageSequence(isSuperAdmin: boolean): TutorialPage[] {
  const pages: TutorialPage[] = [
    { path: "/dashboard", label: "Overview", steps: OVERVIEW_STEPS },
    { path: "/staff", label: "Staff", steps: STAFF_STEPS },
    { path: "/payroll", label: "Payroll", steps: PAYROLL_STEPS },
  ];
  if (isSuperAdmin) {
    pages.push({ path: "/admin", label: "Admin", steps: ADMIN_STEPS });
  }
  return pages;
}

export function getStepsForPath(path: string, isSuperAdmin: boolean): TutorialStep[] {
  if (path.startsWith("/dashboard")) return OVERVIEW_STEPS;
  if (path.startsWith("/staff")) return STAFF_STEPS;
  if (path.startsWith("/payroll")) return PAYROLL_STEPS;
  if (path.startsWith("/admin") && isSuperAdmin) return ADMIN_STEPS;
  return [];
}

export function getPageIndexForPath(path: string, isSuperAdmin: boolean): number {
  const pages = getPageSequence(isSuperAdmin);
  return pages.findIndex((p) => path.startsWith(p.path));
}
