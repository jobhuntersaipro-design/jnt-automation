import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { countParcelsPerTier, formatRate } from "../payroll/tier-counter";
import type { TierBreakdown } from "../payroll/tier-counter";

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const B = "#000";
const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 40, paddingHorizontal: 50, fontSize: 9, fontFamily: "Helvetica" },

  center: { textAlign: "center", marginBottom: 24 },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  addressLine: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 1 },

  partTitle: { textAlign: "center", textDecoration: "underline", fontSize: 9.5, marginBottom: 2 },
  partBox: { flexDirection: "row" as const, borderTopWidth: 1, borderTopColor: B },
  partLeft: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  partRight: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, borderLeftWidth: 1, borderLeftColor: B },
  partRow: { flexDirection: "row" as const, marginBottom: 1.5 },
  partLabel: { width: 90, fontSize: 9 },
  partColon: { width: 10, fontSize: 9 },
  partVal: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold" },

  tableOuter: { flexDirection: "row" as const, borderWidth: 1, borderColor: B, marginTop: 10 },
  halfLeft: { flex: 1, borderRightWidth: 1, borderRightColor: B },
  halfRight: { flex: 1 },

  hdrRow: { flexDirection: "row" as const, borderBottomWidth: 1, borderBottomColor: B, paddingVertical: 3, paddingHorizontal: 6 },
  hdrLabel: { flex: 1, fontSize: 9, textAlign: "center" as const, textDecoration: "underline" as const },
  hdrRM: { width: 80, fontSize: 9, textAlign: "center" as const, textDecoration: "underline" as const },

  dataRow: { flexDirection: "row" as const, paddingVertical: 2, paddingHorizontal: 6 },
  cellL: { flex: 1, fontSize: 9 },
  cellR: { width: 80, fontSize: 9, textAlign: "right" as const },

  sepRow: { flexDirection: "row" as const, paddingVertical: 3, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: B },
  sepLabelCenterBold: { flex: 1, fontSize: 9, textAlign: "center" as const, fontFamily: "Helvetica-Bold" },
  sepAmtBold: { width: 80, fontSize: 9, textAlign: "right" as const, fontFamily: "Helvetica-Bold" },

  // Employer contribution section
  employerRow: { flexDirection: "row" as const, paddingVertical: 3, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: B },
  employerLeft: { flex: 1 },
  employerRight: { flex: 1, borderLeftWidth: 1, borderLeftColor: B, paddingLeft: 6 },
  employerLine: { flexDirection: "row" as const, marginBottom: 1 },
  employerLabel: { width: 45, fontSize: 9 },
  employerColon: { width: 10, fontSize: 9 },
  employerVal: { flex: 1, fontSize: 9 },

  remarksRow: { paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: B },
  remarksBold: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  footer: { flexDirection: "row" as const, marginTop: 60, justifyContent: "space-between" as const, alignItems: "flex-end" as const },
  sigBlock: { alignItems: "center" as const, width: 180 },
  sigDots: { fontSize: 9, marginBottom: 3 },
  sigLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  stamp: { width: 70, height: 70, marginBottom: 8, objectFit: "contain" as const },
});

// ────────────────────────────────────────────────────────────────────
// Input types
// ────────────────────────────────────────────────────────────────────

export interface EmployeePayslipInput {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;

  employeeName: string;
  icNo: string;
  position: string; // "SUPERVISOR" | "ADMIN" | "STORE KEEPER"
  employeeType: "SUPERVISOR" | "ADMIN" | "STORE_KEEPER";
  month: number;
  year: number;

  // Statutory reference numbers
  epfNo: string | null;
  socsoNo: string | null;
  incomeTaxNo: string | null;

  // Employee earnings
  basicPay: number;
  workingHours: number; // store keeper only
  hourlyWage: number;   // store keeper only
  petrolAllowance: number;
  kpiAllowance: number;
  otherAllowance: number;

  // Dispatcher data (for combined payslip)
  dispatcherTierBreakdowns?: TierBreakdown[];
  dispatcherIncentive?: number;
  dispatcherPetrolSubsidy?: number;
  dispatcherPenalty?: number;
  dispatcherAdvance?: number;

  // Statutory deductions (on combined gross)
  epfEmployee: number;
  socsoEmployee: number;
  eisEmployee: number;
  pcb: number;
  penalty: number;
  advance: number;

  // Employer contributions
  epfEmployer: number;
  socsoEmployer: number;
  eisEmployer: number;

  grossSalary: number;
  netSalary: number;
}

const h = React.createElement;

const POSITION_LABEL: Record<string, string> = {
  SUPERVISOR: "SUPERVISOR",
  ADMIN: "ADMIN",
  STORE_KEEPER: "STORE KEEPER",
};

function EmployeePayslipDocument({ data }: { data: EmployeePayslipInput }) {
  const isCombined = data.dispatcherTierBreakdowns !== undefined && data.dispatcherTierBreakdowns !== null;
  const isStoreKeeper = data.employeeType === "STORE_KEEPER";

  const companyHeader = data.companyRegistrationNo
    ? `${data.companyName} (${data.companyRegistrationNo})`
    : data.companyName;
  const addressLines = data.companyAddress ? data.companyAddress.split("\n") : [];
  const lastDay = new Date(data.year, data.month, 0).getDate();
  const dateStr = `${String(lastDay).padStart(2, "0")}/${String(data.month).padStart(2, "0")}/${data.year}`;
  const position = POSITION_LABEL[data.employeeType] ?? data.position;

  // ── Right-side particulars fields differ by type ──
  // Supervisor/Admin: DATE, EPF NO, SOCSO NO
  // Store Keeper: DATE, SOCSO NO, INCOME TAX NO
  const rightParticulars = isStoreKeeper
    ? [
        { label: "DATE", value: dateStr },
        { label: "SOCSO NO", value: data.socsoNo ?? "" },
        { label: "INCOME TAX NO", value: data.incomeTaxNo ?? "" },
      ]
    : [
        { label: "DATE", value: dateStr },
        { label: "EPF NO", value: data.epfNo ?? "" },
        { label: "SOCSO NO", value: data.socsoNo ?? "" },
      ];

  // ── Build addition rows ──
  const addRows: React.ReactElement[] = [];

  // Combined: dispatcher parcel tiers first
  if (isCombined && data.dispatcherTierBreakdowns) {
    for (const t of data.dispatcherTierBreakdowns) {
      addRows.push(
        h(View, { key: `dt${t.tier}`, style: s.dataRow },
          h(Text, { style: s.cellL }, `Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`),
          h(Text, { style: s.cellR }, formatRM(t.total)),
        ),
      );
    }
    if (data.dispatcherIncentive && data.dispatcherIncentive > 0) {
      addRows.push(h(View, { key: "dinc", style: s.dataRow },
        h(Text, { style: s.cellL }, "Incentive"),
        h(Text, { style: s.cellR }, formatRM(data.dispatcherIncentive)),
      ));
    }
    if (data.dispatcherPetrolSubsidy && data.dispatcherPetrolSubsidy > 0) {
      addRows.push(h(View, { key: "dpet", style: s.dataRow },
        h(Text, { style: s.cellL }, "Petrol Subsidy"),
        h(Text, { style: s.cellR }, formatRM(data.dispatcherPetrolSubsidy)),
      ));
    }
  }

  // Employee earnings
  if (isStoreKeeper) {
    const wageLabel = `WAGES (${data.workingHours} HOUR)`;
    addRows.push(h(View, { key: "wages", style: s.dataRow },
      h(Text, { style: s.cellL }, wageLabel),
      h(Text, { style: s.cellR }, formatRM(data.workingHours * data.hourlyWage)),
    ));
  } else {
    addRows.push(h(View, { key: "basic", style: s.dataRow },
      h(Text, { style: s.cellL }, "BASIC PAY"),
      h(Text, { style: s.cellR }, formatRM(data.basicPay)),
    ));
  }
  if (data.petrolAllowance > 0) {
    addRows.push(h(View, { key: "petrol", style: s.dataRow },
      h(Text, { style: s.cellL }, "PETROL ALLOWANCE"),
      h(Text, { style: s.cellR }, formatRM(data.petrolAllowance)),
    ));
  }
  if (data.kpiAllowance > 0) {
    addRows.push(h(View, { key: "kpi", style: s.dataRow },
      h(Text, { style: s.cellL }, "KPI"),
      h(Text, { style: s.cellR }, formatRM(data.kpiAllowance)),
    ));
  }
  if (data.otherAllowance > 0) {
    addRows.push(h(View, { key: "other", style: s.dataRow },
      h(Text, { style: s.cellL }, "ALLOWANCE"),
      h(Text, { style: s.cellR }, formatRM(data.otherAllowance)),
    ));
  }

  // ── Build deduction rows ──
  const dedRows: React.ReactElement[] = [];
  if (data.epfEmployee > 0) {
    dedRows.push(h(View, { key: "epf", style: s.dataRow },
      h(Text, { style: s.cellL }, "EMPLOYEE EPF (KWSP)"),
      h(Text, { style: s.cellR }, formatRM(data.epfEmployee)),
    ));
  }
  if (data.socsoEmployee > 0) {
    dedRows.push(h(View, { key: "socso", style: s.dataRow },
      h(Text, { style: s.cellL }, "EMPLOYEE SOCSO(PERKESO)"),
      h(Text, { style: s.cellR }, formatRM(data.socsoEmployee)),
    ));
  }
  if (data.eisEmployee > 0) {
    dedRows.push(h(View, { key: "eis", style: s.dataRow },
      h(Text, { style: s.cellL }, "EMPLOYMENT INSURANCE SCHEME (EIS)"),
      h(Text, { style: s.cellR }, formatRM(data.eisEmployee)),
    ));
  }
  if (data.pcb > 0) {
    dedRows.push(h(View, { key: "pcb", style: s.dataRow },
      h(Text, { style: s.cellL }, "PCB"),
      h(Text, { style: s.cellR }, formatRM(data.pcb)),
    ));
  }
  if (data.penalty > 0) {
    dedRows.push(h(View, { key: "pen", style: s.dataRow },
      h(Text, { style: s.cellL }, "Penalty"),
      h(Text, { style: s.cellR }, formatRM(data.penalty)),
    ));
  }
  if (data.advance > 0) {
    dedRows.push(h(View, { key: "adv", style: s.dataRow },
      h(Text, { style: s.cellL }, "Advance"),
      h(Text, { style: s.cellR }, formatRM(data.advance)),
    ));
  }
  // Dispatcher penalty/advance in combined
  if (isCombined && data.dispatcherPenalty && data.dispatcherPenalty > 0) {
    dedRows.push(h(View, { key: "dpen", style: s.dataRow },
      h(Text, { style: s.cellL }, "Penalty (Dispatcher)"),
      h(Text, { style: s.cellR }, formatRM(data.dispatcherPenalty)),
    ));
  }
  if (isCombined && data.dispatcherAdvance && data.dispatcherAdvance > 0) {
    dedRows.push(h(View, { key: "dadv", style: s.dataRow },
      h(Text, { style: s.cellL }, "Advance (Dispatcher)"),
      h(Text, { style: s.cellR }, formatRM(data.dispatcherAdvance)),
    ));
  }

  return h(Document, null,
    h(Page, { size: "A4", style: s.page },

      // ── Company Header ──
      h(View, { style: s.center },
        h(Text, { style: s.companyName }, companyHeader),
        ...addressLines.map((line, i) => h(Text, { key: i, style: s.addressLine }, line)),
      ),

      // ── Employee Particulars ──
      h(Text, { style: s.partTitle }, "EMPLOYEE'S PARTICULARS"),
      h(View, { style: s.partBox },
        h(View, { style: s.partLeft },
          h(View, { style: s.partRow },
            h(Text, { style: s.partLabel }, "NAME"),
            h(Text, { style: s.partColon }, ":"),
            h(Text, { style: s.partVal }, data.employeeName),
          ),
          h(View, { style: s.partRow },
            h(Text, { style: s.partLabel }, "I/C NO"),
            h(Text, { style: s.partColon }, ":"),
            h(Text, { style: s.partVal }, data.icNo),
          ),
          h(View, { style: s.partRow },
            h(Text, { style: s.partLabel }, "POSITION"),
            h(Text, { style: s.partColon }, ":"),
            h(Text, { style: s.partVal }, position),
          ),
        ),
        h(View, { style: s.partRight },
          ...rightParticulars.map((rp, i) =>
            h(View, { key: i, style: s.partRow },
              h(Text, { style: s.partLabel }, rp.label),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, rp.value),
            ),
          ),
        ),
      ),

      // ── Addition / Deduction Table ──
      h(View, { style: s.tableOuter },

        // LEFT HALF — Addition
        h(View, { style: s.halfLeft },
          h(View, { style: s.hdrRow },
            h(Text, { style: s.hdrLabel }, "ADDITION"),
            h(Text, { style: s.hdrRM }, "RM"),
          ),
          ...addRows,
          h(View, { style: { flex: 1 } }),
          // TOTAL
          h(View, { style: s.sepRow },
            h(Text, { style: s.sepLabelCenterBold }, "TOTAL :-"),
            h(Text, { style: s.sepAmtBold }, formatRM(data.grossSalary)),
          ),
          // EMPLOYER'S CONTRIBUTION
          h(View, { style: { paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: B } },
            h(Text, { style: { ...s.remarksBold, marginBottom: 4 } }, "EMPLOYER'S CONTRIBUTION"),
            h(View, { style: s.employerLine },
              h(Text, { style: s.employerLabel }, "EPF"),
              h(Text, { style: s.employerColon }, ":"),
              h(Text, { style: s.employerVal }, `RM${formatRM(data.epfEmployer)}`),
            ),
            h(View, { style: s.employerLine },
              h(Text, { style: s.employerLabel }, "SOCSO"),
              h(Text, { style: s.employerColon }, ":"),
              h(Text, { style: s.employerVal }, `RM${formatRM(data.socsoEmployer)}`),
            ),
            h(View, { style: s.employerLine },
              h(Text, { style: s.employerLabel }, "EIS"),
              h(Text, { style: s.employerColon }, ":"),
              h(Text, { style: s.employerVal }, `RM${formatRM(data.eisEmployer)}`),
            ),
          ),
        ),

        // RIGHT HALF — Deduction
        h(View, { style: s.halfRight },
          h(View, { style: s.hdrRow },
            h(Text, { style: s.hdrLabel }, "DEDUCTION"),
            h(Text, { style: s.hdrRM }, "RM"),
          ),
          ...dedRows,
          h(View, { style: { flex: 1 } }),
          // NET PAY
          h(View, { style: s.sepRow },
            h(Text, { style: s.sepLabelCenterBold }, "NET PAY :-"),
            h(Text, { style: s.sepAmtBold }, formatRM(data.netSalary)),
          ),
          // REMARKS
          h(View, { style: s.remarksRow },
            h(Text, { style: s.remarksBold }, "REMARKS :-"),
          ),
          h(View, { style: { minHeight: 16 } }),
        ),
      ),

      // ── Stamp + Signatures ──
      h(View, { style: s.footer },
        h(View, { style: s.sigBlock },
          h(Text, { style: s.sigDots }, "......................."),
          h(Text, { style: s.sigLabel }, "PREPARED BY"),
        ),
        h(View, { style: s.sigBlock },
          ...(data.stampImageUrl
            ? [h(Image, { key: "stamp", style: s.stamp, src: data.stampImageUrl })]
            : []),
          h(Text, { style: s.sigDots }, "......................."),
          h(Text, { style: s.sigLabel }, "APPROVED BY"),
        ),
      ),
    ),
  );
}

export async function generateEmployeePayslipPdf(input: EmployeePayslipInput): Promise<Buffer> {
  const doc = h(EmployeePayslipDocument, { data: input });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await renderToBuffer(doc as any);
  return Buffer.from(result);
}

// Re-export for combined payslips that need tier breakdown
export { countParcelsPerTier, formatRate };
export type { TierBreakdown };
