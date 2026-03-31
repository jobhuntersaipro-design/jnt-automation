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
  { month: "JAN", actual: 3200000, projected: 3100000 },
  { month: "FEB", actual: 3050000, projected: 3200000 },
  { month: "MAR", actual: 3400000, projected: 3300000 },
  { month: "APR", actual: 3600000, projected: 3500000 },
  { month: "MAY", actual: 3500000, projected: 3600000 },
  { month: "JUN", actual: 3750000, projected: 3700000 },
  { month: "JUL", actual: 3900000, projected: 3800000 },
  { month: "AUG", actual: 3800000, projected: 3900000 },
  { month: "SEP", actual: 4000000, projected: 4000000 },
  { month: "OCT", actual: 4100000, projected: 4100000 },
  { month: "NOV", actual: 4200000, projected: 4300000 },
  { month: "DEC", actual: 4350000, projected: 4500000 },
];

export const mockBranches = [
  { name: "Kepong", netPayout: 980000 },
  { name: "Cheras", netPayout: 850000 },
  { name: "Puchong", netPayout: 720000 },
  { name: "Subang", netPayout: 640000 },
  { name: "Klang", netPayout: 570000 },
  { name: "Shah Alam", netPayout: 440000 },
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

export const mockNotifications = [
  {
    id: "n1",
    type: "upload" as const,
    message: "Upload Request #4109",
    detail: "Kepong Branch · March 2025",
    createdAt: "2025-03-28T09:14:00Z",
  },
  {
    id: "n2",
    type: "payroll" as const,
    message: "Payroll Finalised: May 2024",
    detail: "All 6 branches · 312 dispatchers",
    createdAt: "2025-03-27T14:30:00Z",
  },
  {
    id: "n3",
    type: "new_dispatcher" as const,
    message: "Data Entry Complete",
    detail: "Cheras Branch · 3 new dispatchers detected",
    createdAt: "2025-03-26T11:05:00Z",
  },
];

export const mockTopDispatchers = [
  {
    id: "D001",
    name: "James Marcus",
    branch: "Kepong",
    totalOrders: 3882,
    baseSalary: 5940,
    netSalary: 6810,
    avatarUrl: null,
    gender: "MALE" as const,
  },
  {
    id: "D042",
    name: "Laura Rodriguez",
    branch: "Cheras",
    totalOrders: 2533,
    baseSalary: 4820,
    netSalary: 5960,
    avatarUrl: null,
    gender: "FEMALE" as const,
  },
  {
    id: "D017",
    name: "Marcus Knight",
    branch: "Puchong",
    totalOrders: 2490,
    baseSalary: 4310,
    netSalary: 5260,
    avatarUrl: null,
    gender: "MALE" as const,
  },
];
