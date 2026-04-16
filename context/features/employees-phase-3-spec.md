# Staff Page — Phase 3: Employee Payslip Generation (Updated)

## Overview

Generate payslip PDFs for employees from the Staff Payroll tab. Matches exact
ST XIANG format from real payslips. Two templates: employee-only and combined
(dispatcher + employee). Employee template includes EPF/SOCSO/EIS deductions
and employer contribution section.

## Expected Outcome

After this phase:
- "Generate Payslip" button per employee row in confirmed month
- Employee-only payslip matches Nurul Emyra format exactly
- Combined payslip matches Muhammad Fikri format + adds missing EPF/SOCSO/EIS
- IC number prompted if missing
- Multi-select + ZIP download

---

## Template 1 — Employee Only (Supervisor/Admin)

Based on Nurul Emyra's payslip:

```
ST XIANG TRANSPORTATION SDN BHD (202401013061)
NO 1 GF, JALAN SEROJA JAYA 1
TAMAN SEROJA JAYA 28380 KEMAYAN PAHANG

                    EMPLOYEE'S PARTICULARS
NAME:     NURUL EMYRA SHAHIRAH BINTI OMAR   DATE:     31/03/2026
I/C NO:   030121-01-1652                    EPF NO:   24785983
POSITION: SUPERVISOR                        SOCSO NO:

ADDITION              RM    DEDUCTION                          RM
BASIC PAY          2,500.00  EMPLOYEE EPF (KWSP)             447.00
PETROL ALLOWANCE     150.00  EMPLOYEE SOCSO (PERKESO)         20.25
KPI                1,100.00  EMPLOYMENT INSURANCE SCHEME (EIS) 8.10
ALLOWANCE            300.00  PCB                              51.15
                             Penalty                           x.xx  ← if > 0

TOTAL:-            4,050.00
EMPLOYER'S CONTRIBUTION      NET PAY:-                     3,523.50

EPF   : RM528.00
SOCSO : RM70.85             REMARKS:-
EIS   : RM8.10

[Company Stamp]
PREPARED BY                  APPROVED BY
```

**Notes on format:**
- Right side of particulars: `EPF NO` + `SOCSO NO` (not Income Tax No)
- Deduction labels exact: `EMPLOYEE EPF (KWSP)`, `EMPLOYEE SOCSO(PERKESO)`, `EMPLOYMENT INSURANCE SCHEME (EIS)`
- Employer contribution listed vertically on LEFT side of the employer section
- Net pay on RIGHT side of employer section
- Remarks below employer EPF/SOCSO/EIS on left
- KPI shown as `KPI` not `KPI ALLOWANCE`
- ALLOWANCE shown as `ALLOWANCE` (renamed from "Other Allowance" in UI but displays as ALLOWANCE on PDF)

---

## Template 2 — Store Keeper Only

Same as Template 1 but:
- No `EPF NO` field — shows `SOCSO NO` + `INCOME TAX NO` instead
- Addition shows `WAGES (X HOUR)` instead of BASIC PAY
- EPF/SOCSO/EIS still calculated and shown (client missed these on Muhammad Fikri's — they should be there)

```
NAME:     MUHAMMAD FIKRI BIN ZAMRI          DATE:     31/03/2026
I/C NO:   940314-01-5759                    SOCSO NO:
POSITION: STORE KEEPER                      INCOME TAX NO:

ADDITION              RM    DEDUCTION                          RM
WAGES (63.5 HOUR)    553.72  EMPLOYEE EPF (KWSP)              xx.xx
KPI                  xxx.xx  EMPLOYEE SOCSO (PERKESO)          x.xx
PETROL ALLOWANCE     xxx.xx  EMPLOYMENT INSURANCE SCHEME (EIS) x.xx
ALLOWANCE            xxx.xx  PCB                               x.xx  ← if > 0
                             Penalty                           x.xx  ← if > 0

TOTAL:-              xxx.xx
EMPLOYER'S CONTRIBUTION      NET PAY:-                       xxx.xx

EPF   : RMxxx.xx
SOCSO : RMxx.xx             REMARKS:-
EIS   : RMx.xx
```

---

## Template 3 — Combined (Dispatcher + Employee)

Based on Muhammad Fikri's payslip + adds missing EPF/SOCSO/EIS:

```
NAME:     MUHAMMAD FIKRI BIN ZAMRI          DATE:     31/03/2026
I/C NO:   940314-01-5759                    SOCSO NO:
POSITION: STORE KEEPER                      INCOME TAX NO:

ADDITION                      RM    DEDUCTION                          RM
Parcel Delivered (3750*RM 1.1) 4,125.00  EMPLOYEE EPF (KWSP)        xxx.xx
Parcel Delivered (66*RM 1.4)      92.40  EMPLOYEE SOCSO (PERKESO)    xx.xx
Parcel Delivered (39*RM 2.3)      89.70  EMPLOYMENT INSURANCE (EIS)   x.xx
Incentive                        xxx.xx  ← if > 0
Petrol Subsidy                   xxx.xx  ← if > 0  PCB              xxx.xx ← if > 0
WAGES (63.5 HOUR)                553.72  Penalty                    xxx.xx ← if > 0
KPI                              xxx.xx  Advance                    xxx.xx ← if > 0
PETROL ALLOWANCE                 xxx.xx
ALLOWANCE                        xxx.xx

TOTAL:-                        x,xxx.xx
EMPLOYER'S CONTRIBUTION          NET PAY:-                        x,xxx.xx

EPF   : RMxxx.xx
SOCSO : RMxx.xx              REMARKS:-
EIS   : RMx.xx
```

EPF/SOCSO/EIS calculated on total gross (all parcel commissions + incentive + petrol subsidy + wages + allowances).

---

## Employee Particulars — Fields by Type

| Field | Supervisor/Admin | Store Keeper |
|---|---|---|
| Left side | NAME, I/C NO, POSITION | NAME, I/C NO, POSITION |
| Right side | DATE, EPF NO, SOCSO NO | DATE, SOCSO NO, INCOME TAX NO |

---

## EPF NO Field

- Stored on `Employee` model as optional string
- Shown in particulars for Supervisor/Admin
- Not shown for Store Keeper (shows SOCSO NO + INCOME TAX NO instead)
- Add `epfNo String?` and `socsoNo String?` and `incomeTaxNo String?` to Employee model
- All optional — blank if not filled

```prisma
model Employee {
  // ... existing fields ...
  epfNo        String?
  socsoNo      String?
  incomeTaxNo  String?
}
```

---

## Generation Flow

1. Click "Generate Payslip"
2. IC missing → prompt to enter IC → save → continue
3. If combined → check `SalaryRecord` exists for linked dispatcher same month
   - Exists → Template 3
   - Not exists → prompt: "Dispatcher payroll for [month] not confirmed yet. Generate employee-only payslip?"
4. Select correct template based on type + combined status
5. PDF downloads immediately

---

## Multi-Select

Floating action bar when 1+ rows selected:
```
3 employees selected    [Generate Payslips ↓]    [Clear]
```
- ZIP: `staff_payslips_[month]_[year].zip`
- Files: `[position]_[name]_[month]_[year].pdf`

---

## API Routes

### `POST /api/staff/payroll/[month]/[year]/payslip/[employeeId]`
Generate single PDF. Selects correct template automatically.

### `POST /api/staff/payroll/[month]/[year]/payslips`
Generate ZIP for selected employees.

---

## DB Changes

```prisma
model Employee {
  // ... existing fields ...
  epfNo        String?
  socsoNo      String?
  incomeTaxNo  String?
}
```

Add to existing migration or new migration:
```bash
npx prisma migrate dev --name add-employee-statutory-numbers
```

---

## Files to Create

| File | Action |
|---|---|
| `src/components/staff/payslip-action-bar.tsx` | Create |
| `src/components/staff/employee-payslip-document.tsx` | Create — React PDF, 3 templates |
| `src/lib/staff/payslip-generator.ts` | Create |
| `src/app/api/staff/payroll/[month]/[year]/payslip/[employeeId]/route.ts` | Create |
| `src/app/api/staff/payroll/[month]/[year]/payslips/route.ts` | Create |
| `src/components/staff/employee-drawer.tsx` | Modify — add EPF NO, SOCSO NO, Income Tax No fields |

---

## Testing

1. Supervisor payslip → EPF NO + SOCSO NO in particulars
2. Store keeper payslip → SOCSO NO + INCOME TAX NO in particulars (no EPF NO)
3. Deduction labels exact: `EMPLOYEE EPF (KWSP)`, `EMPLOYEE SOCSO(PERKESO)`, `EMPLOYMENT INSURANCE SCHEME (EIS)`
4. Employer contribution on LEFT: EPF / SOCSO / EIS listed vertically
5. Net pay on RIGHT of employer section
6. KPI shown as `KPI` not `KPI ALLOWANCE`
7. Other Allowance shown as `ALLOWANCE` on PDF
8. Combined → parcel rows + wages in one payslip
9. Combined → EPF/SOCSO/EIS on total gross
10. Penalty shown only if > 0
11. PCB shown only if > 0
12. Advance shown only if > 0 (combined only)
13. Company stamp bottom right
14. IC missing → prompt shown
15. Multi-select ZIP correct

## Status

Not started. Complete Phase 2 first.
