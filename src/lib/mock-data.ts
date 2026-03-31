export const mockSummary = {
  totalNetPayout: 4200000,
  avgMonthlySalary: 3850,
  totalDispatchers: 1248,
  totalOrders: 42850,
};

export const mockPrevSummary = {
  avgMonthlySalary: 3640,
  totalDispatchers: 1205,
  totalOrders: 41200,
};

export const mockMonthlyTrend = [
  { month: "Oct", netPayout: 3400000 },
  { month: "Nov", netPayout: 3600000 },
  { month: "Dec", netPayout: 3500000 },
  { month: "Jan", netPayout: 3900000 },
  { month: "Feb", netPayout: 3750000 },
  { month: "Mar", netPayout: 4200000 },
];

export const mockMonthlyTrendFull = [
  { month: "JAN", actual: 3200000, projected: 3100000, baseSalary: 2750000 },
  { month: "FEB", actual: 3050000, projected: 3200000, baseSalary: 2610000 },
  { month: "MAR", actual: 3400000, projected: 3300000, baseSalary: 2930000 },
  { month: "APR", actual: 3600000, projected: 3500000, baseSalary: 3110000 },
  { month: "MAY", actual: 3500000, projected: 3600000, baseSalary: 3010000 },
  { month: "JUN", actual: 3750000, projected: 3700000, baseSalary: 3240000 },
  { month: "JUL", actual: 3900000, projected: 3800000, baseSalary: 3370000 },
  { month: "AUG", actual: 3800000, projected: 3900000, baseSalary: 3270000 },
  { month: "SEP", actual: 4000000, projected: 4000000, baseSalary: 3450000 },
  { month: "OCT", actual: 4100000, projected: 4100000, baseSalary: 3530000 },
  { month: "NOV", actual: 4200000, projected: 4300000, baseSalary: 3615000 },
  { month: "DEC", actual: 4350000, projected: 4500000, baseSalary: 3745000 },
];

export const mockBranches = [
  { name: "Kepong", netPayout: 980000, totalOrders: 12400, dispatcherCount: 52 },
  { name: "Cheras", netPayout: 850000, totalOrders: 10800, dispatcherCount: 48 },
  { name: "Puchong", netPayout: 720000, totalOrders: 9200, dispatcherCount: 38 },
  { name: "Subang", netPayout: 640000, totalOrders: 8100, dispatcherCount: 34 },
  { name: "Klang", netPayout: 570000, totalOrders: 7200, dispatcherCount: 29 },
  { name: "Shah Alam", netPayout: 440000, totalOrders: 5150, dispatcherCount: 22 },
];

export const mockSalaryBreakdown = [
  { month: "Oct", baseSalary: 2800000, incentive: 380000, petrolSubsidy: 120000, deductions: 80000 },
  { month: "Nov", baseSalary: 2950000, incentive: 410000, petrolSubsidy: 130000, deductions: 90000 },
  { month: "Dec", baseSalary: 2900000, incentive: 390000, petrolSubsidy: 110000, deductions: 85000 },
  { month: "Jan", baseSalary: 3200000, incentive: 450000, petrolSubsidy: 150000, deductions: 100000 },
  { month: "Feb", baseSalary: 3050000, incentive: 430000, petrolSubsidy: 140000, deductions: 95000 },
  { month: "Mar", baseSalary: 3450000, incentive: 490000, petrolSubsidy: 160000, deductions: 110000 },
];

export const mockSalaryBreakdown4 = [
  { month: "FEB", baseSalary: 3050000, incentive: 430000, petrolSubsidy: 140000, deductions: 95000 },
  { month: "MAR", baseSalary: 3450000, incentive: 490000, petrolSubsidy: 160000, deductions: 110000 },
  { month: "APR", baseSalary: 3200000, incentive: 455000, petrolSubsidy: 145000, deductions: 102000 },
  { month: "MAY", baseSalary: 3380000, incentive: 472000, petrolSubsidy: 155000, deductions: 108000 },
];

export const mockSalaryBreakdownFull = [
  { month: "JAN", baseSalary: 2720000, incentive: 365000, petrolSubsidy: 112000, deductions: 76000 },
  { month: "FEB", baseSalary: 2800000, incentive: 382000, petrolSubsidy: 118000, deductions: 80000 },
  { month: "MAR", baseSalary: 2950000, incentive: 408000, petrolSubsidy: 128000, deductions: 85000 },
  { month: "APR", baseSalary: 3050000, incentive: 425000, petrolSubsidy: 135000, deductions: 92000 },
  { month: "MAY", baseSalary: 2980000, incentive: 415000, petrolSubsidy: 130000, deductions: 88000 },
  { month: "JUN", baseSalary: 3100000, incentive: 438000, petrolSubsidy: 140000, deductions: 95000 },
  { month: "JUL", baseSalary: 3200000, incentive: 452000, petrolSubsidy: 148000, deductions: 98000 },
  { month: "AUG", baseSalary: 3150000, incentive: 445000, petrolSubsidy: 144000, deductions: 96000 },
  { month: "SEP", baseSalary: 3280000, incentive: 462000, petrolSubsidy: 152000, deductions: 102000 },
  { month: "OCT", baseSalary: 3350000, incentive: 474000, petrolSubsidy: 156000, deductions: 105000 },
  { month: "NOV", baseSalary: 3420000, incentive: 485000, petrolSubsidy: 160000, deductions: 108000 },
  { month: "DEC", baseSalary: 3500000, incentive: 498000, petrolSubsidy: 165000, deductions: 112000 },
];

export const mockPetrolEligibilityRate = [
  { month: "Oct", rate: 58.24 },
  { month: "Nov", rate: 61.47 },
  { month: "Dec", rate: 59.83 },
  { month: "Jan", rate: 63.12 },
  { month: "Feb", rate: 62.55 },
  { month: "Mar", rate: 64.38 },
];

export const mockPetrolEligibilityFull = [
  { month: "JAN", rate: 57.2, baseline: 60 },
  { month: "FEB", rate: 61.0, baseline: 60 },
  { month: "MAR", rate: 59.5, baseline: 60 },
  { month: "APR", rate: 62.8, baseline: 60 },
  { month: "MAY", rate: 61.5, baseline: 60 },
  { month: "JUN", rate: 63.0, baseline: 60 },
  { month: "JUL", rate: 62.0, baseline: 60 },
  { month: "AUG", rate: 61.8, baseline: 60 },
  { month: "SEP", rate: 63.5, baseline: 60 },
  { month: "OCT", rate: 62.4, baseline: 60 },
  { month: "NOV", rate: 63.8, baseline: 60 },
  { month: "DEC", rate: 64.2, baseline: 60 },
];

export const mockIncentiveHitRateFull = [
  { month: "JAN", rate: 54.2 },
  { month: "FEB", rate: 56.8 },
  { month: "MAR", rate: 58.4 },
  { month: "APR", rate: 61.2 },
  { month: "MAY", rate: 59.7 },
  { month: "JUN", rate: 62.5 },
  { month: "JUL", rate: 63.8 },
  { month: "AUG", rate: 62.1 },
  { month: "SEP", rate: 64.5 },
  { month: "OCT", rate: 65.2 },
  { month: "NOV", rate: 66.8 },
  { month: "DEC", rate: 68.5 },
];

export const mockNotifications = [
  {
    id: "n1",
    type: "upload" as const,
    message: "Upload Request #4109",
    detail: "Kepong Branch · March 2026",
    createdAt: "2026-03-31T09:14:00Z",
  },
  {
    id: "n2",
    type: "payroll" as const,
    message: "Payroll Finalised: Feb 2026",
    detail: "All 6 branches · 312 dispatchers",
    createdAt: "2026-03-30T14:30:00Z",
  },
  {
    id: "n3",
    type: "new_dispatcher" as const,
    message: "Data Entry Complete",
    detail: "Cheras Branch · 3 new dispatchers detected",
    createdAt: "2026-03-29T11:05:00Z",
  },
];

export const mockTopDispatchers = [
  {
    id: "D001",
    name: "James Marcus",
    branch: "Kepong",
    totalOrders: 3882,
    baseSalary: 5940,
    incentive: 720,
    petrolSubsidy: 150,
    netSalary: 6810,
    avatarUrl: null,
    gender: "MALE" as const,
    complianceStatus: "VERIFIED" as const,
  },
  {
    id: "D042",
    name: "Laura Rodriguez",
    branch: "Cheras",
    totalOrders: 2533,
    baseSalary: 4820,
    incentive: 900,
    petrolSubsidy: 240,
    netSalary: 5960,
    avatarUrl: null,
    gender: "FEMALE" as const,
    complianceStatus: "VERIFIED" as const,
  },
  {
    id: "D017",
    name: "Marcus Knight",
    branch: "Puchong",
    totalOrders: 2490,
    baseSalary: 4310,
    incentive: 750,
    petrolSubsidy: 200,
    netSalary: 5260,
    avatarUrl: null,
    gender: "MALE" as const,
    complianceStatus: "PENDING" as const,
  },
  {
    id: "D085",
    name: "Aisha Tan",
    branch: "Subang",
    totalOrders: 2210,
    baseSalary: 4050,
    incentive: 660,
    petrolSubsidy: 180,
    netSalary: 4890,
    avatarUrl: null,
    gender: "FEMALE" as const,
    complianceStatus: "VERIFIED" as const,
  },
  {
    id: "D033",
    name: "Rajan Pillai",
    branch: "Klang",
    totalOrders: 2180,
    baseSalary: 3920,
    incentive: 640,
    petrolSubsidy: 150,
    netSalary: 4710,
    avatarUrl: null,
    gender: "MALE" as const,
    complianceStatus: "PENDING" as const,
  },
  {
    id: "D071",
    name: "Priya Nair",
    branch: "Shah Alam",
    totalOrders: 1960,
    baseSalary: 3540,
    incentive: 630,
    petrolSubsidy: 150,
    netSalary: 4320,
    avatarUrl: null,
    gender: "FEMALE" as const,
    complianceStatus: "VERIFIED" as const,
  },
  {
    id: "D029",
    name: "Wei Chen",
    branch: "Kepong",
    totalOrders: 1880,
    baseSalary: 3400,
    incentive: 600,
    petrolSubsidy: 150,
    netSalary: 4150,
    avatarUrl: null,
    gender: "MALE" as const,
    complianceStatus: "PENDING" as const,
  },
];
