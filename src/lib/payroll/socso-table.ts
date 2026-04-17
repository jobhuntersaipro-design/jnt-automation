// SOCSO (PERKESO) First Category contribution table
// Employment Injury Scheme + Invalidity Scheme
// Wage ceiling: RM6,000/month (effective October 2024)

interface SocsoBracket {
  maxSalary: number
  employee: number
  employer: number
}

const SOCSO_TABLE: SocsoBracket[] = [
  { maxSalary: 30, employee: 0.10, employer: 0.40 },
  { maxSalary: 50, employee: 0.20, employer: 0.70 },
  { maxSalary: 70, employee: 0.30, employer: 1.10 },
  { maxSalary: 100, employee: 0.40, employer: 1.50 },
  { maxSalary: 140, employee: 0.60, employer: 2.10 },
  { maxSalary: 200, employee: 0.85, employer: 2.95 },
  { maxSalary: 300, employee: 1.25, employer: 4.35 },
  { maxSalary: 400, employee: 1.75, employer: 6.15 },
  { maxSalary: 500, employee: 2.25, employer: 7.85 },
  { maxSalary: 600, employee: 2.75, employer: 9.65 },
  { maxSalary: 700, employee: 3.25, employer: 11.35 },
  { maxSalary: 800, employee: 3.75, employer: 13.15 },
  { maxSalary: 900, employee: 4.25, employer: 14.85 },
  { maxSalary: 1000, employee: 4.75, employer: 16.65 },
  { maxSalary: 1100, employee: 5.25, employer: 18.35 },
  { maxSalary: 1200, employee: 5.75, employer: 20.15 },
  { maxSalary: 1300, employee: 6.25, employer: 21.85 },
  { maxSalary: 1400, employee: 6.75, employer: 23.65 },
  { maxSalary: 1500, employee: 7.25, employer: 25.35 },
  { maxSalary: 1600, employee: 7.75, employer: 27.15 },
  { maxSalary: 1700, employee: 8.25, employer: 28.85 },
  { maxSalary: 1800, employee: 8.75, employer: 30.65 },
  { maxSalary: 1900, employee: 9.25, employer: 32.35 },
  { maxSalary: 2000, employee: 9.75, employer: 34.15 },
  { maxSalary: 2100, employee: 10.25, employer: 35.85 },
  { maxSalary: 2200, employee: 10.75, employer: 37.65 },
  { maxSalary: 2300, employee: 11.25, employer: 39.35 },
  { maxSalary: 2400, employee: 11.75, employer: 41.15 },
  { maxSalary: 2500, employee: 12.25, employer: 42.85 },
  { maxSalary: 2600, employee: 12.75, employer: 44.65 },
  { maxSalary: 2700, employee: 13.25, employer: 46.35 },
  { maxSalary: 2800, employee: 13.75, employer: 48.15 },
  { maxSalary: 2900, employee: 14.25, employer: 49.85 },
  { maxSalary: 3000, employee: 14.75, employer: 51.65 },
  { maxSalary: 3100, employee: 15.25, employer: 53.35 },
  { maxSalary: 3200, employee: 15.75, employer: 55.15 },
  { maxSalary: 3300, employee: 16.25, employer: 56.85 },
  { maxSalary: 3400, employee: 16.75, employer: 58.65 },
  { maxSalary: 3500, employee: 17.25, employer: 60.35 },
  { maxSalary: 3600, employee: 17.75, employer: 62.15 },
  { maxSalary: 3700, employee: 18.25, employer: 63.85 },
  { maxSalary: 3800, employee: 18.75, employer: 65.65 },
  { maxSalary: 3900, employee: 19.25, employer: 67.35 },
  { maxSalary: 4000, employee: 19.75, employer: 69.15 },
  { maxSalary: 4100, employee: 20.25, employer: 70.85 },
  { maxSalary: 4200, employee: 20.75, employer: 72.65 },
  { maxSalary: 4300, employee: 21.25, employer: 74.35 },
  { maxSalary: 4400, employee: 21.75, employer: 76.15 },
  { maxSalary: 4500, employee: 22.25, employer: 77.85 },
  { maxSalary: 4600, employee: 22.75, employer: 79.65 },
  { maxSalary: 4700, employee: 23.25, employer: 81.35 },
  { maxSalary: 4800, employee: 23.75, employer: 83.15 },
  { maxSalary: 4900, employee: 24.25, employer: 84.85 },
  { maxSalary: 5000, employee: 24.75, employer: 86.65 },
  { maxSalary: 5100, employee: 25.25, employer: 88.35 },
  { maxSalary: 5200, employee: 25.75, employer: 90.15 },
  { maxSalary: 5300, employee: 26.25, employer: 91.85 },
  { maxSalary: 5400, employee: 26.75, employer: 93.65 },
  { maxSalary: 5500, employee: 27.25, employer: 95.35 },
  { maxSalary: 5600, employee: 27.75, employer: 97.15 },
  { maxSalary: 5700, employee: 28.25, employer: 98.85 },
  { maxSalary: 5800, employee: 28.75, employer: 100.65 },
  { maxSalary: 5900, employee: 29.25, employer: 102.35 },
  { maxSalary: 6000, employee: 29.75, employer: 104.15 },
]

const SOCSO_CAP_BRACKET = SOCSO_TABLE[SOCSO_TABLE.length - 1]

export function lookupSocso(grossSalary: number): { employee: number; employer: number } {
  if (grossSalary <= 0) return { employee: 0, employer: 0 }

  const capped = Math.min(grossSalary, 6000)
  const bracket = SOCSO_TABLE.find((b) => capped <= b.maxSalary) ?? SOCSO_CAP_BRACKET

  return { employee: bracket.employee, employer: bracket.employer }
}
