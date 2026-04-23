import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import { escapeCsv } from "@/lib/csv";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function filenameSafe(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || "dispatcher";
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
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const lines: string[] = [];
  lines.push(`Dispatcher,${escapeCsv(dispatcher.name)}`);
  lines.push(`Dispatcher ID,${escapeCsv(dispatcher.extId)}`);
  lines.push(`Branch,${escapeCsv(dispatcher.branch.code)}`);
  lines.push("");
  lines.push([
    "Month", "Year", "Total Orders",
    "Base Salary (RM)", "Bonus Tier (RM)",
    "Petrol Subsidy (RM)", "Qualifying Days",
    "Penalty (RM)", "Advance (RM)",
    "Net Salary (RM)",
  ].join(","));

  for (const r of records) {
    lines.push([
      MONTH_NAMES[r.month - 1],
      r.year,
      r.totalOrders,
      r.baseSalary.toFixed(2),
      r.bonusTierEarnings.toFixed(2),
      r.petrolSubsidy.toFixed(2),
      r.petrolQualifyingDays,
      r.penalty.toFixed(2),
      r.advance.toFixed(2),
      r.netSalary.toFixed(2),
    ].map(escapeCsv).join(","));
  }

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
    { totalOrders: 0, baseSalary: 0, bonusTierEarnings: 0, petrolSubsidy: 0, petrolQualifyingDays: 0, penalty: 0, advance: 0, netSalary: 0 },
  );

  lines.push([
    "TOTAL", "",
    totals.totalOrders,
    totals.baseSalary.toFixed(2),
    totals.bonusTierEarnings.toFixed(2),
    totals.petrolSubsidy.toFixed(2),
    totals.petrolQualifyingDays,
    totals.penalty.toFixed(2),
    totals.advance.toFixed(2),
    totals.netSalary.toFixed(2),
  ].map(escapeCsv).join(","));

  const csv = lines.join("\n");
  const filename = `${filenameSafe(dispatcher.name)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
