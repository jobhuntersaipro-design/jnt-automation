// EIS (SIP) Employment Insurance System contribution table
// 0.2% employee + 0.2% employer
// Wage ceiling: RM6,000/month (effective October 2024)

interface EisBracket {
  maxSalary: number
  employee: number
  employer: number
}

const EIS_TABLE: EisBracket[] = [
  { maxSalary: 30, employee: 0.05, employer: 0.05 },
  { maxSalary: 50, employee: 0.10, employer: 0.10 },
  { maxSalary: 70, employee: 0.10, employer: 0.10 },
  { maxSalary: 100, employee: 0.20, employer: 0.20 },
  { maxSalary: 140, employee: 0.25, employer: 0.25 },
  { maxSalary: 200, employee: 0.35, employer: 0.35 },
  { maxSalary: 300, employee: 0.50, employer: 0.50 },
  { maxSalary: 400, employee: 0.70, employer: 0.70 },
  { maxSalary: 500, employee: 0.90, employer: 0.90 },
  { maxSalary: 600, employee: 1.10, employer: 1.10 },
  { maxSalary: 700, employee: 1.30, employer: 1.30 },
  { maxSalary: 800, employee: 1.50, employer: 1.50 },
  { maxSalary: 900, employee: 1.70, employer: 1.70 },
  { maxSalary: 1000, employee: 1.90, employer: 1.90 },
  { maxSalary: 1100, employee: 2.10, employer: 2.10 },
  { maxSalary: 1200, employee: 2.30, employer: 2.30 },
  { maxSalary: 1300, employee: 2.50, employer: 2.50 },
  { maxSalary: 1400, employee: 2.70, employer: 2.70 },
  { maxSalary: 1500, employee: 2.90, employer: 2.90 },
  { maxSalary: 1600, employee: 3.10, employer: 3.10 },
  { maxSalary: 1700, employee: 3.30, employer: 3.30 },
  { maxSalary: 1800, employee: 3.50, employer: 3.50 },
  { maxSalary: 1900, employee: 3.70, employer: 3.70 },
  { maxSalary: 2000, employee: 3.90, employer: 3.90 },
  { maxSalary: 2100, employee: 4.10, employer: 4.10 },
  { maxSalary: 2200, employee: 4.30, employer: 4.30 },
  { maxSalary: 2300, employee: 4.50, employer: 4.50 },
  { maxSalary: 2400, employee: 4.70, employer: 4.70 },
  { maxSalary: 2500, employee: 4.90, employer: 4.90 },
  { maxSalary: 2600, employee: 5.10, employer: 5.10 },
  { maxSalary: 2700, employee: 5.30, employer: 5.30 },
  { maxSalary: 2800, employee: 5.50, employer: 5.50 },
  { maxSalary: 2900, employee: 5.70, employer: 5.70 },
  { maxSalary: 3000, employee: 5.90, employer: 5.90 },
  { maxSalary: 3100, employee: 6.10, employer: 6.10 },
  { maxSalary: 3200, employee: 6.30, employer: 6.30 },
  { maxSalary: 3300, employee: 6.50, employer: 6.50 },
  { maxSalary: 3400, employee: 6.70, employer: 6.70 },
  { maxSalary: 3500, employee: 6.90, employer: 6.90 },
  { maxSalary: 3600, employee: 7.10, employer: 7.10 },
  { maxSalary: 3700, employee: 7.30, employer: 7.30 },
  { maxSalary: 3800, employee: 7.50, employer: 7.50 },
  { maxSalary: 3900, employee: 7.70, employer: 7.70 },
  { maxSalary: 4000, employee: 7.90, employer: 7.90 },
  { maxSalary: 4100, employee: 8.10, employer: 8.10 },
  { maxSalary: 4200, employee: 8.30, employer: 8.30 },
  { maxSalary: 4300, employee: 8.50, employer: 8.50 },
  { maxSalary: 4400, employee: 8.70, employer: 8.70 },
  { maxSalary: 4500, employee: 8.90, employer: 8.90 },
  { maxSalary: 4600, employee: 9.10, employer: 9.10 },
  { maxSalary: 4700, employee: 9.30, employer: 9.30 },
  { maxSalary: 4800, employee: 9.50, employer: 9.50 },
  { maxSalary: 4900, employee: 9.70, employer: 9.70 },
  { maxSalary: 5000, employee: 9.90, employer: 9.90 },
  { maxSalary: 5100, employee: 10.10, employer: 10.10 },
  { maxSalary: 5200, employee: 10.30, employer: 10.30 },
  { maxSalary: 5300, employee: 10.50, employer: 10.50 },
  { maxSalary: 5400, employee: 10.70, employer: 10.70 },
  { maxSalary: 5500, employee: 10.90, employer: 10.90 },
  { maxSalary: 5600, employee: 11.10, employer: 11.10 },
  { maxSalary: 5700, employee: 11.30, employer: 11.30 },
  { maxSalary: 5800, employee: 11.50, employer: 11.50 },
  { maxSalary: 5900, employee: 11.70, employer: 11.70 },
  { maxSalary: 6000, employee: 11.90, employer: 11.90 },
]

const EIS_CAP_BRACKET = EIS_TABLE[EIS_TABLE.length - 1]

export function lookupEis(grossSalary: number): { employee: number; employer: number } {
  if (grossSalary <= 0) return { employee: 0, employer: 0 }

  const capped = Math.min(grossSalary, 6000)
  const bracket = EIS_TABLE.find((b) => capped <= b.maxSalary) ?? EIS_CAP_BRACKET

  return { employee: bracket.employee, employer: bracket.employer }
}
