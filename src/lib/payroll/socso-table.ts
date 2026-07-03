// SOCSO (PERKESO) First Category contribution table — updated to the
// "New Contribution Rate Including SKBBK" schedule.
// Employment Injury Scheme + Invalidity Scheme + Non-Employment Injury Scheme.
// Wage ceiling: RM6,000/month.
//
// Employee share now has TWO parts:
//   - `employee`  → Invalidity Scheme portion ("Employee's Contribution")
//   - `lindung`   → Non-Employment Injury portion ("Lindung 24 Jam" / SKBBK)
// Both are deducted from the employee; total employee SOCSO = employee + lindung.

interface SocsoBracket {
  maxSalary: number
  /** Employee Invalidity Scheme share ("Contribution"). */
  employee: number
  /** Employee Non-Employment Injury share ("Lindung 24 Jam" / SKBBK). */
  lindung: number
  employer: number
}

const SOCSO_TABLE: SocsoBracket[] = [
  { maxSalary: 30, employee: 0.10, lindung: 0.20, employer: 0.40 },
  { maxSalary: 50, employee: 0.20, lindung: 0.30, employer: 0.70 },
  { maxSalary: 70, employee: 0.30, lindung: 0.50, employer: 1.10 },
  { maxSalary: 100, employee: 0.40, lindung: 0.65, employer: 1.50 },
  { maxSalary: 140, employee: 0.60, lindung: 0.90, employer: 2.10 },
  { maxSalary: 200, employee: 0.85, lindung: 1.25, employer: 2.95 },
  { maxSalary: 300, employee: 1.25, lindung: 1.85, employer: 4.35 },
  { maxSalary: 400, employee: 1.75, lindung: 2.65, employer: 6.15 },
  { maxSalary: 500, employee: 2.25, lindung: 3.35, employer: 7.85 },
  { maxSalary: 600, employee: 2.75, lindung: 4.15, employer: 9.65 },
  { maxSalary: 700, employee: 3.25, lindung: 4.85, employer: 11.35 },
  { maxSalary: 800, employee: 3.75, lindung: 5.65, employer: 13.15 },
  { maxSalary: 900, employee: 4.25, lindung: 6.35, employer: 14.85 },
  { maxSalary: 1000, employee: 4.75, lindung: 7.15, employer: 16.65 },
  { maxSalary: 1100, employee: 5.25, lindung: 7.85, employer: 18.35 },
  { maxSalary: 1200, employee: 5.75, lindung: 8.65, employer: 20.15 },
  { maxSalary: 1300, employee: 6.25, lindung: 9.35, employer: 21.85 },
  { maxSalary: 1400, employee: 6.75, lindung: 10.15, employer: 23.65 },
  { maxSalary: 1500, employee: 7.25, lindung: 10.85, employer: 25.35 },
  { maxSalary: 1600, employee: 7.75, lindung: 11.65, employer: 27.15 },
  { maxSalary: 1700, employee: 8.25, lindung: 12.35, employer: 28.85 },
  { maxSalary: 1800, employee: 8.75, lindung: 13.15, employer: 30.65 },
  { maxSalary: 1900, employee: 9.25, lindung: 13.85, employer: 32.35 },
  { maxSalary: 2000, employee: 9.75, lindung: 14.65, employer: 34.15 },
  { maxSalary: 2100, employee: 10.25, lindung: 15.35, employer: 35.85 },
  { maxSalary: 2200, employee: 10.75, lindung: 16.15, employer: 37.65 },
  { maxSalary: 2300, employee: 11.25, lindung: 16.85, employer: 39.35 },
  { maxSalary: 2400, employee: 11.75, lindung: 17.65, employer: 41.15 },
  { maxSalary: 2500, employee: 12.25, lindung: 18.35, employer: 42.85 },
  { maxSalary: 2600, employee: 12.75, lindung: 19.15, employer: 44.65 },
  { maxSalary: 2700, employee: 13.25, lindung: 19.85, employer: 46.35 },
  { maxSalary: 2800, employee: 13.75, lindung: 20.65, employer: 48.15 },
  { maxSalary: 2900, employee: 14.25, lindung: 21.35, employer: 49.85 },
  { maxSalary: 3000, employee: 14.75, lindung: 22.15, employer: 51.65 },
  { maxSalary: 3100, employee: 15.25, lindung: 22.85, employer: 53.35 },
  { maxSalary: 3200, employee: 15.75, lindung: 23.65, employer: 55.15 },
  { maxSalary: 3300, employee: 16.25, lindung: 24.35, employer: 56.85 },
  { maxSalary: 3400, employee: 16.75, lindung: 25.15, employer: 58.65 },
  { maxSalary: 3500, employee: 17.25, lindung: 25.85, employer: 60.35 },
  { maxSalary: 3600, employee: 17.75, lindung: 26.65, employer: 62.15 },
  { maxSalary: 3700, employee: 18.25, lindung: 27.35, employer: 63.85 },
  { maxSalary: 3800, employee: 18.75, lindung: 28.15, employer: 65.65 },
  { maxSalary: 3900, employee: 19.25, lindung: 28.85, employer: 67.35 },
  { maxSalary: 4000, employee: 19.75, lindung: 29.65, employer: 69.15 },
  { maxSalary: 4100, employee: 20.25, lindung: 30.35, employer: 70.85 },
  { maxSalary: 4200, employee: 20.75, lindung: 31.15, employer: 72.65 },
  { maxSalary: 4300, employee: 21.25, lindung: 31.85, employer: 74.35 },
  { maxSalary: 4400, employee: 21.75, lindung: 32.65, employer: 76.15 },
  { maxSalary: 4500, employee: 22.25, lindung: 33.35, employer: 77.85 },
  { maxSalary: 4600, employee: 22.75, lindung: 34.15, employer: 79.65 },
  { maxSalary: 4700, employee: 23.25, lindung: 34.85, employer: 81.35 },
  { maxSalary: 4800, employee: 23.75, lindung: 35.65, employer: 83.15 },
  { maxSalary: 4900, employee: 24.25, lindung: 36.35, employer: 84.85 },
  { maxSalary: 5000, employee: 24.75, lindung: 37.15, employer: 86.65 },
  { maxSalary: 5100, employee: 25.25, lindung: 37.85, employer: 88.35 },
  { maxSalary: 5200, employee: 25.75, lindung: 38.65, employer: 90.15 },
  { maxSalary: 5300, employee: 26.25, lindung: 39.35, employer: 91.85 },
  { maxSalary: 5400, employee: 26.75, lindung: 40.15, employer: 93.65 },
  { maxSalary: 5500, employee: 27.25, lindung: 40.85, employer: 95.35 },
  { maxSalary: 5600, employee: 27.75, lindung: 41.65, employer: 97.15 },
  { maxSalary: 5700, employee: 28.25, lindung: 42.35, employer: 98.85 },
  { maxSalary: 5800, employee: 28.75, lindung: 43.15, employer: 100.65 },
  { maxSalary: 5900, employee: 29.25, lindung: 43.85, employer: 102.35 },
  { maxSalary: 6000, employee: 29.75, lindung: 44.65, employer: 104.15 },
]

const SOCSO_CAP_BRACKET = SOCSO_TABLE[SOCSO_TABLE.length - 1]

export function lookupSocso(
  grossSalary: number,
): { employee: number; lindung: number; employer: number } {
  if (grossSalary <= 0) return { employee: 0, lindung: 0, employer: 0 }

  const capped = Math.min(grossSalary, 6000)
  const bracket = SOCSO_TABLE.find((b) => capped <= b.maxSalary) ?? SOCSO_CAP_BRACKET

  return { employee: bracket.employee, lindung: bracket.lindung, employer: bracket.employer }
}
