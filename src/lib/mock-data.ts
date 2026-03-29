export const mockSummary = {
  totalNetPayout: 482950,
  baseSalary: 310200,
  incentive: 92450,
  petrolSubsidy: 54100,
  penalty: 18400,
  advance: 7200,
};

export const mockMonthlyTrend = [
  { month: "Oct", netPayout: 390000 },
  { month: "Nov", netPayout: 420000 },
  { month: "Dec", netPayout: 405000 },
  { month: "Jan", netPayout: 455000 },
  { month: "Feb", netPayout: 438000 },
  { month: "Mar", netPayout: 482950 },
];

export const mockBranches = [
  { name: "Kepong", netPayout: 112400, totalOrders: 5820 },
  { name: "Cheras", netPayout: 98750, totalOrders: 5100 },
  { name: "Puchong", netPayout: 87300, totalOrders: 4510 },
  { name: "Subang", netPayout: 76200, totalOrders: 3940 },
  { name: "Klang", netPayout: 63150, totalOrders: 3260 },
  { name: "Shah Alam", netPayout: 45150, totalOrders: 2330 },
];

export const mockTopDispatchers = [
  {
    id: "D001",
    name: "James Sullivan",
    branch: "Kepong",
    totalOrders: 2840,
    netSalary: 6450,
    avatarUrl: null,
    gender: "MALE" as const,
  },
  {
    id: "D042",
    name: "Laura Rodriguez",
    branch: "Cheras",
    totalOrders: 2610,
    netSalary: 5880,
    avatarUrl: null,
    gender: "FEMALE" as const,
  },
  {
    id: "D017",
    name: "Marcus Knight",
    branch: "Puchong",
    totalOrders: 2490,
    netSalary: 5260,
    avatarUrl: null,
    gender: "MALE" as const,
  },
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
