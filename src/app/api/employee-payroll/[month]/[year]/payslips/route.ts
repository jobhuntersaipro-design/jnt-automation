import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { generateEmployeePayslipPdf, countParcelsPerTier } from "@/lib/staff/payslip-generator";
import { generatePayslipZip } from "@/lib/payroll/zip-generator";
import type { EmployeePayslipInput } from "@/lib/staff/payslip-generator";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string; year: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { month: monthStr, year: yearStr } = await params;
  const month = parseInt(monthStr);
  const year = parseInt(yearStr);
  const body = await req.json();
  const { employeeIds } = body as { employeeIds?: string[] };

  if (!employeeIds?.length) {
    return NextResponse.json({ error: "No employees selected" }, { status: 400 });
  }

  if (employeeIds.length > 50) {
    return NextResponse.json({ error: "Maximum 50 payslips at once" }, { status: 400 });
  }

  // Fetch employees + salary records + branch
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, agentId: effective.agentId },
    include: {
      branch: { select: { id: true } },
      salaryRecords: {
        where: { month, year },
        take: 1,
      },
    },
  });

  const agent = await prisma.agent.findUnique({
    where: { id: effective.agentId },
    select: {
      name: true,
      companyRegistrationNo: true,
      companyAddress: true,
      stampImageUrl: true,
    },
  });

  // Auto-match dispatchers by name + branch (case-insensitive)
  const dispatcherSalaries = await prisma.salaryRecord.findMany({
    where: {
      month,
      year,
      dispatcher: { branch: { agentId: effective.agentId } },
    },
    include: {
      dispatcher: { select: { name: true, branchId: true } },
      lineItems: { select: { weight: true, commission: true } },
    },
  });

  // Build lookup: lowercase name + branchId → salary record
  const dispatcherMap = new Map<string, typeof dispatcherSalaries[number]>();
  for (const ds of dispatcherSalaries) {
    dispatcherMap.set(`${ds.dispatcher.name.toLowerCase()}::${ds.dispatcher.branchId}`, ds);
  }

  const payslips: { fileName: string; buffer: Buffer }[] = [];

  for (const emp of employees) {
    const salaryRecord = emp.salaryRecords[0];
    if (!salaryRecord || !emp.icNo) continue;

    let dispatcherData: {
      tierBreakdowns: { tier: number; count: number; rate: number; total: number }[];
      incentive: number;
      petrolSubsidy: number;
      penalty: number;
      advance: number;
    } | null = null;

    const matchKey = emp.branchId ? `${emp.name.toLowerCase()}::${emp.branchId}` : null;
    const ds = matchKey ? dispatcherMap.get(matchKey) : null;
    if (ds) {
      const snapshot = (ds.weightTiersSnapshot ?? []) as {
        tier: number;
        minWeight: number;
        maxWeight: number | null;
        commission: number;
      }[];
      dispatcherData = {
        tierBreakdowns: countParcelsPerTier(ds.lineItems, snapshot),
        incentive: ds.incentive,
        petrolSubsidy: ds.petrolSubsidy,
        penalty: ds.penalty,
        advance: ds.advance,
      };
    }

    const icFormatted = emp.icNo.replace(/(\d{6})(\d{2})(\d{4})/, "$1-$2-$3");

    const input: EmployeePayslipInput = {
      companyName: agent?.name ?? "Company",
      companyRegistrationNo: agent?.companyRegistrationNo ?? null,
      companyAddress: agent?.companyAddress ?? null,
      stampImageUrl: agent?.stampImageUrl ?? null,
      employeeName: emp.name,
      icNo: icFormatted,
      position: emp.type,
      employeeType: emp.type,
      month,
      year,
      epfNo: emp.epfNo,
      socsoNo: emp.socsoNo,
      incomeTaxNo: emp.incomeTaxNo,
      basicPay: salaryRecord.basicPay,
      workingHours: salaryRecord.workingHours,
      hourlyWage: salaryRecord.hourlyWage,
      petrolAllowance: salaryRecord.petrolAllowance,
      kpiAllowance: salaryRecord.kpiAllowance,
      otherAllowance: salaryRecord.otherAllowance,
      dispatcherTierBreakdowns: dispatcherData?.tierBreakdowns,
      dispatcherIncentive: dispatcherData?.incentive,
      dispatcherPetrolSubsidy: dispatcherData?.petrolSubsidy,
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
    const posLabel = emp.type.toLowerCase().replace("_", "-");
    const safeName = emp.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
    payslips.push({
      fileName: `${posLabel}_${safeName}_${MONTH_NAMES[month - 1]}_${year}.pdf`,
      buffer,
    });
  }

  if (payslips.length === 0) {
    return NextResponse.json({ error: "No payslips could be generated (missing IC or salary data)" }, { status: 400 });
  }

  // Single payslip — return PDF directly
  if (payslips.length === 1) {
    return new NextResponse(new Uint8Array(payslips[0].buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${payslips[0].fileName}"`,
      },
    });
  }

  // Multiple — ZIP
  const zipBuffer = await generatePayslipZip(payslips);
  const zipName = `staff_payslips_${MONTH_NAMES[month - 1]}_${year}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
}
