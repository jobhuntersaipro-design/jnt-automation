import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { renderSummaryTablePdf } from "@/lib/pdf/summary-table";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmt(n: number): string {
  return n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const dispatcher = await prisma.dispatcher.findFirst({
    where: { id, branch: { agentId: effective.agentId } },
    select: {
      extId: true,
      name: true,
      branch: { select: { code: true } },
    },
  });
  if (!dispatcher) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const records = await prisma.salaryRecord.findMany({
    where: { dispatcherId: id },
    select: {
      month: true,
      year: true,
      totalOrders: true,
      baseSalary: true,
      bonusTierEarnings: true,
      petrolSubsidy: true,
      petrolQualifyingDays: true,
      penalty: true,
      advance: true,
      netSalary: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const rows = records.map((r) => {
    const wasRecalc = r.updatedAt.getTime() - r.createdAt.getTime() > 1000;
    const status = wasRecalc
      ? "Recalculated"
      : r.netSalary <= 0 || r.totalOrders === 0
        ? "Review"
        : "Confirmed";
    return [
      `${MONTH_NAMES[r.month - 1]} ${r.year}`,
      String(r.totalOrders),
      fmt(r.baseSalary),
      r.bonusTierEarnings > 0 ? fmt(r.bonusTierEarnings) : "—",
      r.petrolSubsidy > 0 ? fmt(r.petrolSubsidy) : "—",
      String(r.petrolQualifyingDays || "—"),
      r.penalty > 0 ? fmt(r.penalty) : "—",
      r.advance > 0 ? fmt(r.advance) : "—",
      fmt(r.netSalary),
      status,
    ];
  });

  const totals = records.reduce(
    (acc, r) => ({
      totalOrders: acc.totalOrders + r.totalOrders,
      baseSalary: acc.baseSalary + r.baseSalary,
      bonusTierEarnings: acc.bonusTierEarnings + r.bonusTierEarnings,
      petrolSubsidy: acc.petrolSubsidy + r.petrolSubsidy,
      petrolQualifyingDays: acc.petrolQualifyingDays + r.petrolQualifyingDays,
      penalty: acc.penalty + r.penalty,
      advance: acc.advance + r.advance,
      netSalary: acc.netSalary + r.netSalary,
    }),
    {
      totalOrders: 0,
      baseSalary: 0,
      bonusTierEarnings: 0,
      petrolSubsidy: 0,
      petrolQualifyingDays: 0,
      penalty: 0,
      advance: 0,
      netSalary: 0,
    },
  );

  const footer = [
    "TOTAL",
    String(totals.totalOrders),
    fmt(totals.baseSalary),
    fmt(totals.bonusTierEarnings),
    fmt(totals.petrolSubsidy),
    String(totals.petrolQualifyingDays),
    fmt(totals.penalty),
    fmt(totals.advance),
    fmt(totals.netSalary),
    "",
  ];

  const pdf = await renderSummaryTablePdf({
    title: `Salary history — ${dispatcher.name}`,
    subtitle: `${dispatcher.extId} · Branch ${dispatcher.branch.code}`,
    meta: [
      `${records.length} month${records.length === 1 ? "" : "s"}`,
      `Generated ${new Date().toLocaleString("en-MY", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
    ],
    columns: [
      { label: "Period", flex: 1.2 },
      { label: "Orders", flex: 1, align: "right", tabular: true },
      { label: "Base", flex: 1.2, align: "right", tabular: true },
      { label: "Bonus Tier", flex: 1.2, align: "right", tabular: true },
      { label: "Petrol", flex: 1.2, align: "right", tabular: true },
      { label: "Qual. Days", flex: 1, align: "right", tabular: true },
      { label: "Penalty", flex: 1.1, align: "right", tabular: true },
      { label: "Advance", flex: 1.1, align: "right", tabular: true },
      { label: "Net (RM)", flex: 1.3, align: "right", tabular: true },
      { label: "Status", flex: 1.2 },
    ],
    rows,
    footer,
  });

  const filename = `history_${dispatcher.extId}_${dispatcher.branch.code}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
