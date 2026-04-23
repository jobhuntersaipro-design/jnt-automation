import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";
import {
  generateEmployeePayslipPdf,
  countParcelsPerTier,
  countBonusParcelsPerTier,
} from "@/lib/staff/payslip-generator";
import type { EmployeePayslipInput } from "@/lib/staff/payslip-generator";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string; year: string; employeeId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month: monthStr, year: yearStr, employeeId } = await params;
  const month = parseInt(monthStr);
  const year = parseInt(yearStr);

  if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month/year" }, { status: 400 });
  }

  // Fetch employee + salary record + branch
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, agentId: effective.agentId },
    include: {
      branch: { select: { id: true } },
      salaryRecords: {
        where: { month, year },
        take: 1,
      },
    },
  });

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.icNo) {
    return NextResponse.json({ error: "IC_MISSING", message: "IC number required for payslip" }, { status: 400 });
  }

  const salaryRecord = employee.salaryRecords[0];
  if (!salaryRecord) {
    return NextResponse.json({ error: "No salary record for this month" }, { status: 404 });
  }

  // Fetch agent company info
  const agent = await prisma.agent.findUnique({
    where: { id: effective.agentId },
    select: {
      name: true,
      companyRegistrationNo: true,
      companyAddress: true,
      stampImageUrl: true,
    },
  });

  // Auto-match dispatcher by name + branch (case-insensitive)
  let dispatcherData: {
    tierBreakdowns: { tier: number; count: number; rate: number; total: number }[];
    bonusTierBreakdowns: { tier: number; count: number; rate: number; total: number }[];
    petrolSubsidy: number;
    commission: number;
    penalty: number;
    advance: number;
  } | null = null;

  if (employee.branchId) {
    const matchedDispatcher = await prisma.dispatcher.findFirst({
      where: {
        name: { equals: employee.name, mode: "insensitive" },
        branchId: employee.branchId,
      },
      select: { id: true },
    });

    if (matchedDispatcher) {
      const dispatcherSalary = await prisma.salaryRecord.findFirst({
        where: {
          dispatcherId: matchedDispatcher.id,
          month,
          year,
        },
        include: {
          lineItems: { select: { weight: true, commission: true, isBonusTier: true } },
        },
      });

      if (dispatcherSalary) {
        const snapshot = (dispatcherSalary.weightTiersSnapshot ?? []) as {
          tier: number;
          minWeight: number;
          maxWeight: number | null;
          commission: number;
        }[];
        const bonusSnap = dispatcherSalary.bonusTierSnapshot as
          | { orderThreshold: number; tiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }> }
          | null;
        const bonusSnapshot = bonusSnap?.tiers ?? [];
        dispatcherData = {
          tierBreakdowns: countParcelsPerTier(dispatcherSalary.lineItems, snapshot),
          bonusTierBreakdowns: countBonusParcelsPerTier(dispatcherSalary.lineItems, bonusSnapshot),
          petrolSubsidy: dispatcherSalary.petrolSubsidy,
          commission: dispatcherSalary.commission,
          penalty: dispatcherSalary.penalty,
          advance: dispatcherSalary.advance,
        };
      }
    }
  }

  const icFormatted = employee.icNo.replace(/(\d{6})(\d{2})(\d{4})/, "$1-$2-$3");

  const input: EmployeePayslipInput = {
    companyName: agent?.name ?? "Company",
    companyRegistrationNo: agent?.companyRegistrationNo ?? null,
    companyAddress: agent?.companyAddress ?? null,
    stampImageUrl: agent?.stampImageUrl ?? null,
    employeeName: employee.name,
    icNo: icFormatted,
    position: employee.type,
    employeeType: employee.type,
    month,
    year,
    epfNo: employee.epfNo,
    socsoNo: employee.socsoNo,
    incomeTaxNo: employee.incomeTaxNo,
    basicPay: salaryRecord.basicPay,
    workingHours: salaryRecord.workingHours,
    hourlyWage: salaryRecord.hourlyWage,
    petrolAllowance: salaryRecord.petrolAllowance,
    kpiAllowance: salaryRecord.kpiAllowance,
    otherAllowance: salaryRecord.otherAllowance,
    dispatcherTierBreakdowns: dispatcherData?.tierBreakdowns,
    dispatcherBonusTierBreakdowns: dispatcherData?.bonusTierBreakdowns,
    dispatcherPetrolSubsidy: dispatcherData?.petrolSubsidy,
    dispatcherCommission: dispatcherData?.commission,
    dispatcherPenalty: dispatcherData?.penalty,
    dispatcherAdvance: dispatcherData?.advance,
    epfEmployee: salaryRecord.epfEmployee,
    socsoEmployee: salaryRecord.socsoEmployee,
    eisEmployee: salaryRecord.eisEmployee,
    pcb: salaryRecord.pcb,
    penalty: salaryRecord.penalty,
    advance: salaryRecord.advance,
    epfEmployer: salaryRecord.epfEmployer,
    socsoEmployer: salaryRecord.socsoEmployer,
    eisEmployer: salaryRecord.eisEmployer,
    grossSalary: salaryRecord.grossSalary,
    netSalary: salaryRecord.netSalary,
  };

  const buffer = await generateEmployeePayslipPdf(input);

  const posLabel = employee.type.toLowerCase().replace("_", "-");
  const safeName = employee.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const fileName = `${posLabel}_${safeName}_${MONTH_NAMES[month - 1]}_${year}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
