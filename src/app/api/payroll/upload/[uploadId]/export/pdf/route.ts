import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { getSalaryRecordsByUpload } from "@/lib/db/payroll";
import { renderSummaryTablePdf } from "@/lib/pdf/summary-table";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmt(n: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;
  const data = await getSalaryRecordsByUpload(uploadId, effective.agentId);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { upload, records, summary } = data;
  const monthName = MONTH_NAMES[upload.month - 1];

  const rows = records.map((r) => [
    r.name,
    r.extId,
    String(r.totalOrders),
    fmt(r.baseSalary),
    r.bonusTierEarnings > 0 ? fmt(r.bonusTierEarnings) : "—",
    r.petrolSubsidy > 0 ? fmt(r.petrolSubsidy) : "—",
    r.penalty > 0 ? fmt(r.penalty) : "—",
    r.advance > 0 ? fmt(r.advance) : "—",
    r.commission > 0 ? fmt(r.commission) : "—",
    fmt(r.netSalary),
  ]);

  const totalDefaultTier = records.reduce((s, r) => s + r.baseSalary, 0);
  const totalBonusTier = records.reduce((s, r) => s + r.bonusTierEarnings, 0);

  const footer = [
    "TOTAL",
    "",
    String(records.reduce((s, r) => s + r.totalOrders, 0)),
    fmt(totalDefaultTier),
    fmt(totalBonusTier),
    fmt(summary.totalPetrolSubsidy),
    "",
    "",
    fmt(summary.totalCommission),
    fmt(summary.totalNetPayout),
  ];

  const pdf = await renderSummaryTablePdf({
    title: `Payroll — ${monthName} ${upload.year}`,
    subtitle: `Branch ${upload.branchCode}`,
    meta: [
      `${records.length} dispatcher${records.length === 1 ? "" : "s"}`,
      `Generated ${new Date().toLocaleString("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
    ],
    columns: [
      { label: "Dispatcher", flex: 3 },
      { label: "ID", flex: 2 },
      { label: "Orders", flex: 1, align: "right", tabular: true },
      { label: "Default Tier", flex: 1.4, align: "right", tabular: true },
      { label: "Bonus Tier", flex: 1.4, align: "right", tabular: true },
      { label: "Petrol", flex: 1.4, align: "right", tabular: true },
      { label: "Penalty", flex: 1.2, align: "right", tabular: true },
      { label: "Advance", flex: 1.2, align: "right", tabular: true },
      { label: "Commission", flex: 1.3, align: "right", tabular: true },
      { label: "Net (RM)", flex: 1.5, align: "right", tabular: true },
    ],
    rows,
    footer,
  });

  const mm = String(upload.month).padStart(2, "0");
  const filename = `payroll_${upload.branchCode}_${upload.year}_${mm}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
