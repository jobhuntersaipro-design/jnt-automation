# Staff Page — Phase 2: Employee Payroll + EPF/SOCSO/EIS Calculation

## Overview

Monthly salary entry for employees. Agent enters variable fields per month
(working hours for store keepers, KPI, PCB, penalty). System auto-calculates
EPF, SOCSO, and EIS based on gross salary. Results saved as EmployeeSalaryRecord.

## Expected Outcome

After this phase:
- Staff > Payroll tab shows monthly salary entry per employee
- Agent selects month → enters variable fields
- EPF, SOCSO, EIS auto-calculated
- PCB optional manual entry
- Net salary calculated and shown live
- Confirm saves all records to DB

---

## Statutory Contribution Rules

### EPF (KWSP)
- Employee: **11%** of gross
- Employer: **13%** if gross ≤ RM5,000 / **12%** if gross > RM5,000
- No salary cap
- Round to nearest RM (no cents — per KWSP rules)

### SOCSO (PERKESO)
- Based on salary bracket table (see below)
- Capped at RM4,000/month — salaries above RM4,000 use the RM4,000 bracket
- Both employee + employer contributions

**SOCSO Contribution Table (RM):**

| Salary Range | Employee | Employer |
|---|---|---|
| 0.01 – 30.00 | 0.10 | 0.40 |
| 30.01 – 50.00 | 0.20 | 0.60 |
| 50.01 – 70.00 | 0.30 | 0.85 |
| 70.01 – 100.00 | 0.40 | 1.10 |
| 100.01 – 140.00 | 0.60 | 1.50 |
| 140.01 – 200.00 | 0.85 | 2.10 |
| 200.01 – 300.00 | 1.20 | 3.05 |
| 300.01 – 400.00 | 1.75 | 4.35 |
| 400.01 – 500.00 | 2.25 | 5.65 |
| 500.01 – 600.00 | 2.75 | 6.90 |
| 600.01 – 700.00 | 3.25 | 8.10 |
| 700.01 – 800.00 | 3.75 | 9.40 |
| 800.01 – 900.00 | 4.25 | 10.65 |
| 900.01 – 1000.00 | 4.75 | 11.90 |
| 1000.01 – 1100.00 | 5.25 | 13.15 |
| 1100.01 – 1200.00 | 5.75 | 14.35 |
| 1200.01 – 1300.00 | 6.25 | 15.65 |
| 1300.01 – 1400.00 | 6.75 | 16.90 |
| 1400.01 – 1500.00 | 7.25 | 18.15 |
| 1500.01 – 1600.00 | 7.75 | 19.40 |
| 1600.01 – 1700.00 | 8.25 | 20.65 |
| 1700.01 – 1800.00 | 8.75 | 21.90 |
| 1800.01 – 1900.00 | 9.25 | 23.15 |
| 1900.01 – 2000.00 | 9.75 | 24.40 |
| 2000.01 – 2100.00 | 10.25 | 25.65 |
| 2100.01 – 2200.00 | 10.75 | 26.90 |
| 2200.01 – 2300.00 | 11.25 | 28.15 |
| 2300.01 – 2400.00 | 11.75 | 29.45 |
| 2400.01 – 2500.00 | 12.25 | 30.65 |
| 2500.01 – 2600.00 | 12.75 | 31.90 |
| 2600.01 – 2700.00 | 13.25 | 33.15 |
| 2700.01 – 2800.00 | 13.75 | 34.40 |
| 2800.01 – 2900.00 | 14.25 | 35.65 |
| 2900.01 – 3000.00 | 14.75 | 36.90 |
| 3000.01 – 3100.00 | 15.25 | 38.15 |
| 3100.01 – 3200.00 | 15.75 | 39.40 |
| 3200.01 – 3300.00 | 16.25 | 40.65 |
| 3300.01 – 3400.00 | 16.75 | 41.90 |
| 3400.01 – 3500.00 | 17.25 | 43.15 |
| 3500.01 – 3600.00 | 17.75 | 44.40 |
| 3600.01 – 3700.00 | 18.25 | 45.65 |
| 3700.01 – 3800.00 | 18.75 | 46.90 |
| 3800.01 – 3900.00 | 19.25 | 48.15 |
| 3900.01 – 4000.00 | 19.75 | 49.45 |
| > 4000.00 | 19.75 | 49.45 |

### EIS (SIP)
- Employee: **0.2%** of gross
- Employer: **0.2%** of gross
- Capped at RM4,000/month
- Round to nearest 5 cents

---

## Salary Calculations

### Supervisor / Admin

```
Gross = Basic Pay + Petrol Allowance + KPI Allowance + Other Allowance

EPF Employee    = round(Gross × 0.11)
EPF Employer    = round(Gross × 0.13) if Gross ≤ 5000, else round(Gross × 0.12)
SOCSO Employee  = lookup(min(Gross, 4000))
SOCSO Employer  = lookup(min(Gross, 4000))
EIS Employee    = roundToNearest5Cents(min(Gross, 4000) × 0.002)
EIS Employer    = roundToNearest5Cents(min(Gross, 4000) × 0.002)

Total Deductions = EPF Employee + SOCSO Employee + EIS Employee + PCB + Penalty
Net Salary = Gross - Total Deductions
```

### Store Keeper

```
Gross = (Total Working Hours × Hourly Wage) + KPI Allowance + Petrol Allowance + Other Allowance

// Same EPF/SOCSO/EIS calculation as above
```

### Combined (Dispatcher + Employee)

```
Dispatcher Gross = baseSalary + incentive + petrolSubsidy  // from SalaryRecord
Employee Gross   = Basic Pay / (Hours × Wage) + Allowances // from manual entry

Total Gross = Dispatcher Gross + Employee Gross

EPF/SOCSO/EIS calculated on Total Gross
PCB entered manually on Total Gross
Penalty = dispatcher penalty + employee penalty combined
Advance = from dispatcher SalaryRecord

Net Salary = Total Gross - EPF Employee - SOCSO Employee - EIS Employee - PCB - Penalty - Advance
```

---

## Payroll Tab Layout

### Header
- "Payroll" tab active
- Month + Year selector (defaults to current month)
- "Confirm & Save" button (disabled until all entries complete)

### Entry Table

| Column | Supervisor/Admin | Store Keeper |
|---|---|---|
| Employee | Name + type chip | Name + type chip |
| Gross | Auto from settings | Hours × Wage |
| Working Hours | — | Editable input |
| KPI Allowance | Editable (override) | Editable (override) |
| PCB | Editable (optional) | Editable (optional) |
| Penalty | Editable (optional) | Editable (optional) |
| EPF (11%) | Auto-calculated | Auto-calculated |
| SOCSO | Auto-calculated | Auto-calculated |
| EIS | Auto-calculated | Auto-calculated |
| Net Salary | Auto-calculated | Auto-calculated |

- Net salary recalculates live as any field changes
- Green dot on row = ready to confirm
- Grey dot = store keeper with no hours entered yet

### Summary Cards
- Total Gross Payout
- Total EPF (Employee)
- Total SOCSO (Employee)
- Total EIS (Employee)
- Total Net Payout

### Employer Contributions Summary (below table)
- Total EPF (Employer)
- Total SOCSO (Employer)
- Total EIS (Employer)

---

## DB Model

```prisma
model EmployeeSalaryRecord {
  id         String   @id @default(cuid())
  employeeId String
  month      Int
  year       Int

  // Earnings
  basicPay        Float   @default(0)
  workingHours    Float   @default(0)  // store keeper only
  hourlyWage      Float   @default(0)  // store keeper only
  kpiAllowance    Float   @default(0)
  petrolAllowance Float   @default(0)
  otherAllowance  Float   @default(0)
  grossSalary     Float

  // Statutory (employee)
  epfEmployee    Float
  socsoEmployee  Float
  eisEmployee    Float
  pcb            Float   @default(0)  // manual

  // Statutory (employer)
  epfEmployer    Float
  socsoEmployer  Float
  eisEmployer    Float

  // Deductions
  penalty  Float   @default(0)
  advance  Float   @default(0)  // combined case only

  netSalary Float

  employee  Employee @relation(fields: [employeeId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([employeeId, month, year])
  @@index([employeeId])
  @@index([month, year])
}
```

```bash
npx prisma migrate dev --name add-employee-salary-record
```

---

## API Routes

### `GET /api/staff/payroll/[month]/[year]`
Returns all employees with their salary entry for the selected month.
Pre-fills from settings (basic pay, hourly wage, allowances).
If record exists → returns saved values.

### `POST /api/staff/payroll/[month]/[year]`
Save/update salary entries for all employees for the month.
Calculates EPF/SOCSO/EIS server-side — never trust client calculations.

### `GET /api/staff/payroll/history`
Returns list of confirmed months with total net payout.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/components/staff/payroll-tab.tsx` | Create — monthly entry table |
| `src/components/staff/payroll-summary-cards.tsx` | Create — totals |
| `src/lib/payroll/statutory.ts` | Create — EPF/SOCSO/EIS calculation functions |
| `src/lib/payroll/socso-table.ts` | Create — SOCSO lookup table |
| `src/app/api/staff/payroll/[month]/[year]/route.ts` | Create — GET + POST |
| `src/app/api/staff/payroll/history/route.ts` | Create — GET history |
| `src/app/(dashboard)/staff/page.tsx` | Modify — add Payroll tab |

---

## Testing

1. Select current month → all employees shown with pre-filled values
2. Supervisor — gross auto-calculated from basic pay + allowances
3. Store keeper — enter 63.5 hours → gross = 63.5 × hourly wage
4. Edit KPI allowance → gross + EPF/SOCSO/EIS recalculate live
5. EPF = gross × 11% rounded to nearest RM
6. SOCSO matches lookup table for given gross
7. EIS = gross × 0.2% rounded to nearest 5 cents
8. Gross > RM4,000 → SOCSO + EIS use RM4,000 cap
9. Enter PCB → net salary decreases
10. Enter penalty → net salary decreases
11. Summary cards update live
12. Employer contributions shown separately below table
13. Confirm → EmployeeSalaryRecord saved in DB
14. Re-open same month → saved values pre-filled
15. Verify EPF/SOCSO/EIS calculated server-side (not from client)

## Status

Not started. Complete Phase 1 first.
