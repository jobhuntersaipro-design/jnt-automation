import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";

export interface EmployeeHistoryRecord {
  id: string;
  month: number;
  year: number;
  grossSalary: number;
  basicPay: number;
  workingHours: number;
  hourlyWage: number;
  kpiAllowance: number;
  petrolAllowance: number;
  otherAllowance: number;
  epfEmployee: number;
  socsoEmployee: number;
  eisEmployee: number;
  pcb: number;
  epfEmployer: number;
  socsoEmployer: number;
  eisEmployer: number;
  penalty: number;
  advance: number;
  netSalary: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const employee = await prisma.employee.findFirst({
      where: { id, agentId: effective.agentId },
      select: { id: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const records = await prisma.employeeSalaryRecord.findMany({
      where: { employeeId: id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    const history: EmployeeHistoryRecord[] = records.map((r) => ({
      id: r.id,
      month: r.month,
      year: r.year,
      grossSalary: r.grossSalary,
      basicPay: r.basicPay,
      workingHours: r.workingHours,
      hourlyWage: r.hourlyWage,
      kpiAllowance: r.kpiAllowance,
      petrolAllowance: r.petrolAllowance,
      otherAllowance: r.otherAllowance,
      epfEmployee: r.epfEmployee,
      socsoEmployee: r.socsoEmployee,
      eisEmployee: r.eisEmployee,
      pcb: r.pcb,
      epfEmployer: r.epfEmployer,
      socsoEmployer: r.socsoEmployer,
      eisEmployer: r.eisEmployer,
      penalty: r.penalty,
      advance: r.advance,
      netSalary: r.netSalary,
    }));

    return NextResponse.json(history);
  } catch (err) {
    console.error("[employees/history] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
