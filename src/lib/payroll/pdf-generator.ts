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
import { countBonusParcelsPerTier, countParcelsPerTier, formatRate } from "./tier-counter";
import type { TierBreakdown } from "./tier-counter";

function formatRM(amount: number): string {
  return amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const B = "#000";
const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 40, paddingHorizontal: 50, fontSize: 9, fontFamily: "Helvetica" },

  // Company header — no green bar, centered bold text
  center: { textAlign: "center", marginBottom: 24 },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  addressLine: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 1 },

  // Outer frame — wraps everything from EMPLOYEE'S PARTICULARS down to NET PAY/REMARKS
  outerBox: { borderWidth: 1, borderColor: B },

  // Title row inside the outer box
  partTitleRow: { borderBottomWidth: 1, borderBottomColor: B, paddingVertical: 4 },
  partTitle: { textAlign: "center" as const, fontSize: 9.5 },

  // Employee Particulars (bottom-bordered so addition/deduction sits below)
  partBox: { flexDirection: "row" as const, borderBottomWidth: 1, borderBottomColor: B },
  partLeft: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  partRight: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, borderLeftWidth: 1, borderLeftColor: B },
  partRow: { flexDirection: "row" as const, marginBottom: 1.5 },
  partLabel: { width: 75, fontSize: 9 },
  partColon: { width: 10, fontSize: 9 },
  partVal: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Addition/Deduction columns live inside outerBox; no outer border of their own
  tableOuter: {
    flexDirection: "row" as const,
  },
  // Left half (Addition)
  halfLeft: { flex: 1, borderRightWidth: 1, borderRightColor: B },
  // Right half (Deduction)
  halfRight: { flex: 1 },

  // Header row inside each half
  hdrRow: {
    flexDirection: "row" as const,
    borderBottomWidth: 1,
    borderBottomColor: B,
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  hdrLabel: { flex: 1, fontSize: 9, textAlign: "center" as const, textDecoration: "underline" as const },
  hdrRM: { width: 80, fontSize: 9, textAlign: "center" as const, textDecoration: "underline" as const },

  // Normal data row — NO borders between rows
  dataRow: { flexDirection: "row" as const, paddingVertical: 2, paddingHorizontal: 6 },
  cellL: { flex: 1, fontSize: 9 },
  cellR: { width: 80, fontSize: 9, textAlign: "right" as const },

  // Separator row — has a top border
  sepRow: {
    flexDirection: "row" as const,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: B,
  },
  sepLabelCenterBold: { flex: 1, fontSize: 9, textAlign: "center" as const, fontFamily: "Helvetica-Bold" },
  sepAmtBold: { width: 80, fontSize: 9, textAlign: "right" as const, fontFamily: "Helvetica-Bold" },

  // Remarks
  remarksRow: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: B,
  },
  remarksBold: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // Footer
  footer: { flexDirection: "row" as const, marginTop: 60, justifyContent: "space-between" as const, alignItems: "flex-end" as const },
  sigBlock: { alignItems: "center" as const, width: 180 },
  sigDots: { fontSize: 9, marginBottom: 3 },
  sigLabel: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  stamp: { width: 70, height: 70, marginBottom: 8, objectFit: "contain" as const },
});

export interface PayslipData {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  dispatcherName: string;
  icNo: string;
  month: number;
  year: number;
  /** Default-tier parcels grouped by weight tier (pre-threshold). */
  tierBreakdowns: TierBreakdown[];
  /** Bonus-tier parcels grouped by weight tier (post-threshold). Empty for non-high-performers. */
  bonusTierBreakdowns: TierBreakdown[];
  petrolSubsidy: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

const h = React.createElement;

function PayslipDocument({ data }: { data: PayslipData }) {
  const addTotal =
    data.tierBreakdowns.reduce((sum, t) => sum + t.total, 0) +
    data.bonusTierBreakdowns.reduce((sum, t) => sum + t.total, 0) +
    data.petrolSubsidy +
    data.commission;

  // Company header: "ST XIANG TRANSPORTATION SDN BHD (202401013061)"
  const companyHeader = data.companyRegistrationNo
    ? `${data.companyName} (${data.companyRegistrationNo})`
    : data.companyName;

  const addressLines = data.companyAddress ? data.companyAddress.split("\n") : [];

  // Date: last day of the month DD/MM/YYYY
  const lastDay = new Date(data.year, data.month, 0).getDate();
  const dateStr = `${String(lastDay).padStart(2, "0")}/${String(data.month).padStart(2, "0")}/${data.year}`;

  // Build addition data rows (no borders)
  const addRows: React.ReactElement[] = [];
  for (const t of data.tierBreakdowns) {
    addRows.push(
      h(View, { key: `t${t.tier}`, style: s.dataRow },
        h(Text, { style: s.cellL }, `Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`),
        h(Text, { style: s.cellR }, formatRM(t.total)),
      ),
    );
  }
  for (const t of data.bonusTierBreakdowns) {
    addRows.push(
      h(View, { key: `bt${t.tier}`, style: s.dataRow },
        h(Text, { style: s.cellL }, `Bonus Parcel Delivered (${t.count}*RM ${formatRate(t.rate)})`),
        h(Text, { style: s.cellR }, formatRM(t.total)),
      ),
    );
  }
  if (data.petrolSubsidy > 0) {
    addRows.push(h(View, { key: "pet", style: s.dataRow },
      h(Text, { style: s.cellL }, "Petrol Subsidy"),
      h(Text, { style: s.cellR }, formatRM(data.petrolSubsidy)),
    ));
  }
  if (data.commission > 0) {
    addRows.push(h(View, { key: "com", style: s.dataRow },
      h(Text, { style: s.cellL }, "Commission"),
      h(Text, { style: s.cellR }, formatRM(data.commission)),
    ));
  }

  // Build deduction data rows (no borders)
  const dedRows: React.ReactElement[] = [];
  if (data.penalty > 0) {
    dedRows.push(h(View, { key: "pen", style: s.dataRow },
      h(Text, { style: s.cellL }, "PENALTY"),
      h(Text, { style: s.cellR }, formatRM(data.penalty)),
    ));
  }
  if (data.advance > 0) {
    dedRows.push(h(View, { key: "adv", style: s.dataRow },
      h(Text, { style: s.cellL }, "ADVANCE"),
      h(Text, { style: s.cellR }, formatRM(data.advance)),
    ));
  }

  return h(Document, null,
    h(Page, { size: "A4", style: s.page },

      // ── Company Header ──
      h(View, { style: s.center },
        h(Text, { style: s.companyName }, companyHeader),
        ...addressLines.map((line, i) => h(Text, { key: i, style: s.addressLine }, line)),
      ),

      // ── Outer bordered frame: particulars + table ──
      h(View, { style: s.outerBox },

        // Title bar inside the frame
        h(View, { style: s.partTitleRow },
          h(Text, { style: s.partTitle }, "EMPLOYEE'S PARTICULARS"),
        ),

        // Employee Particulars grid
        h(View, { style: s.partBox },
          h(View, { style: s.partLeft },
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "NAME"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, data.dispatcherName),
            ),
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "I/C NO"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, data.icNo),
            ),
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "POSITION"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, "DESPATCH"),
            ),
          ),
          h(View, { style: s.partRight },
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "DATE"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, dateStr),
            ),
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "SOCSO NO"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, ""),
            ),
            h(View, { style: s.partRow },
              h(Text, { style: s.partLabel }, "INCOME TAX NO"),
              h(Text, { style: s.partColon }, ":"),
              h(Text, { style: s.partVal }, ""),
            ),
          ),
        ),

        // Addition / Deduction columns
        h(View, { style: s.tableOuter },

        // LEFT HALF — Addition
        h(View, { style: s.halfLeft },
          // Header: ADDITION | RM
          h(View, { style: s.hdrRow },
            h(Text, { style: s.hdrLabel }, "ADDITION"),
            h(Text, { style: s.hdrRM }, "RM"),
          ),
          // Data rows (no borders between them)
          ...addRows,
          // Spacer to push TOTAL to bottom
          h(View, { style: { flex: 1 } }),
          // TOTAL row (top border)
          h(View, { style: s.sepRow },
            h(Text, { style: s.sepLabelCenterBold }, "TOTAL :-"),
            h(Text, { style: s.sepAmtBold }, formatRM(addTotal)),
          ),
        ),

        // RIGHT HALF — Deduction
        h(View, { style: s.halfRight },
          // Header: DEDUCTION | RM
          h(View, { style: s.hdrRow },
            h(Text, { style: s.hdrLabel }, "DEDUCTION"),
            h(Text, { style: s.hdrRM }, "RM"),
          ),
          // Data rows (no borders between them)
          ...dedRows,
          // Spacer
          h(View, { style: { flex: 1 } }),
          // NET PAY row (top border)
          h(View, { style: s.sepRow },
            h(Text, { style: s.sepLabelCenterBold }, "NET PAY :-"),
            h(Text, { style: s.sepAmtBold }, formatRM(data.netSalary)),
          ),
          // REMARKS row (top border)
          h(View, { style: s.remarksRow },
            h(Text, { style: s.remarksBold }, "REMARKS :-"),
          ),
          // Empty space below remarks
          h(View, { style: { minHeight: 16 } }),
        ),
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

interface LineItemRow {
  weight: number;
  commission: number;
  isBonusTier?: boolean;
}

interface TierSnapshotRow {
  tier: number;
  minWeight: number;
  maxWeight: number | null;
  commission: number;
}

export interface GeneratePayslipInput {
  companyName: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  dispatcherName: string;
  icNo: string;
  month: number;
  year: number;
  petrolSubsidy: number;
  commission: number;
  penalty: number;
  advance: number;
  netSalary: number;
  lineItems: LineItemRow[];
  weightTiersSnapshot: TierSnapshotRow[];
  /** Tier snapshot used to price post-threshold parcels. Empty for legacy records. */
  bonusTierSnapshot: TierSnapshotRow[];
}

export async function generatePayslipPdf(input: GeneratePayslipInput): Promise<Buffer> {
  const tierBreakdowns = countParcelsPerTier(input.lineItems, input.weightTiersSnapshot);
  const bonusTierBreakdowns = countBonusParcelsPerTier(
    input.lineItems,
    input.bonusTierSnapshot,
  );

  const data: PayslipData = {
    companyName: input.companyName,
    companyRegistrationNo: input.companyRegistrationNo,
    companyAddress: input.companyAddress,
    stampImageUrl: input.stampImageUrl,
    dispatcherName: input.dispatcherName,
    icNo: input.icNo,
    month: input.month,
    year: input.year,
    tierBreakdowns,
    bonusTierBreakdowns,
    petrolSubsidy: input.petrolSubsidy,
    commission: input.commission,
    penalty: input.penalty,
    advance: input.advance,
    netSalary: input.netSalary,
  };

  const doc = h(PayslipDocument, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await renderToBuffer(doc as any);
  return Buffer.from(result);
}
