import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getEffectiveAgentId } from "@/lib/impersonation"
import {
  calculateStatutory,
  calculateNetSalary,
  calculateSupervisorGross,
  calculateStoreKeeperGross,
} from "@/lib/payroll/statutory"
import type { EmployeeType } from "@/generated/prisma/client"

interface EmployeeEntry {
  employeeId: string
  basicPay: number
  workingHours: number
  hourlyWage: number
  kpiAllowance: number
  petrolAllowance: number
  otherAllowance: number
  pcb: number
  penalty: number
  advance: number
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string; year: string }> }
) {
  try {
    const effective = await getEffectiveAgentId()
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const agentId = effective.agentId

    const { month: monthStr, year: yearStr } = await params
    const month = parseInt(monthStr, 10)
    const year = parseInt(yearStr, 10)

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    // Fetch all employees for this agent
    const employees = await prisma.employee.findMany({
      where: { agentId },
      include: {
        branch: { select: { id: true, code: true } },
        dispatcher: { select: { avatarUrl: true } },
        salaryRecords: {
          where: { month, year },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    })

    // Auto-match dispatchers by name + branch (case-insensitive)
    // Fetch all salary records for this month for the agent's dispatchers
    const dispatcherSalaries = await prisma.salaryRecord.findMany({
      where: {
        month,
        year,
        dispatcher: { branch: { agentId } },
      },
      include: {
        dispatcher: {
          select: { name: true, branchId: true },
        },
      },
    })

    // Build lookup: lowercase name + branchId → salary record
    const dispatcherMap = new Map<string, typeof dispatcherSalaries[number]>()
    for (const ds of dispatcherSalaries) {
      const key = `${ds.dispatcher.name.toLowerCase()}::${ds.dispatcher.branchId}`
      dispatcherMap.set(key, ds)
    }

    const result = employees.map((emp) => {
      const saved = emp.salaryRecords[0]

      // Auto-match: find dispatcher with same name + same branch (case-insensitive)
      const matchKey = emp.branchId
        ? `${emp.name.toLowerCase()}::${emp.branchId}`
        : null
      const dispatcherRecord = matchKey ? dispatcherMap.get(matchKey) ?? null : null

      const dispatcherGross = dispatcherRecord
        ? dispatcherRecord.baseSalary +
          dispatcherRecord.bonusTierEarnings +
          dispatcherRecord.petrolSubsidy
        : 0
      const dispatcherPenalty = dispatcherRecord?.penalty ?? 0
      const dispatcherAdvance = dispatcherRecord?.advance ?? 0
      const hasDispatcherMatch = !!dispatcherRecord

      if (saved) {
        return {
          employeeId: emp.id,
          name: emp.name,
          type: emp.type,
          branchCode: emp.branch?.code ?? null,
          icNo: emp.icNo ?? null,
          gender: emp.gender,
          avatarUrl: emp.avatarUrl,
          dispatcherAvatarUrl: emp.dispatcher?.avatarUrl ?? null,
          hasDispatcherMatch,
          dispatcherGross,
          dispatcherPenalty,
          dispatcherAdvance,
          basicPay: saved.basicPay,
          workingHours: saved.workingHours,
          hourlyWage: saved.hourlyWage,
          kpiAllowance: saved.kpiAllowance,
          petrolAllowance: saved.petrolAllowance,
          otherAllowance: saved.otherAllowance,
          grossSalary: saved.grossSalary,
          epfEmployee: saved.epfEmployee,
          epfEmployer: saved.epfEmployer,
          socsoEmployee: saved.socsoEmployee,
          socsoEmployer: saved.socsoEmployer,
          eisEmployee: saved.eisEmployee,
          eisEmployer: saved.eisEmployer,
          pcb: saved.pcb,
          penalty: saved.penalty,
          advance: saved.advance,
          netSalary: saved.netSalary,
          isSaved: true,
        }
      }

      const statutory = calculateStatutory(dispatcherGross)
      const netSalary = calculateNetSalary(dispatcherGross, statutory, 0, dispatcherPenalty, dispatcherAdvance)

      return {
        employeeId: emp.id,
        name: emp.name,
        type: emp.type,
        branchCode: emp.branch?.code ?? null,
        icNo: emp.icNo ?? null,
        gender: emp.gender,
        avatarUrl: emp.avatarUrl,
        dispatcherAvatarUrl: emp.dispatcher?.avatarUrl ?? null,
        hasDispatcherMatch,
        dispatcherGross,
        dispatcherPenalty,
        dispatcherAdvance,
        basicPay: 0,
        workingHours: 0,
        hourlyWage: 0,
        kpiAllowance: 0,
        petrolAllowance: 0,
        otherAllowance: 0,
        grossSalary: dispatcherGross,
        ...statutory,
        pcb: 0,
        penalty: dispatcherPenalty,
        advance: dispatcherAdvance,
        netSalary,
        isSaved: false,
      }
    })

    return NextResponse.json({ entries: result, month, year })
  } catch (err) {
    console.error("[employee-payroll] GET error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string; year: string }> }
) {
  try {
    const effective = await getEffectiveAgentId()
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const agentId = effective.agentId

    const { month: monthStr, year: yearStr } = await params
    const month = parseInt(monthStr, 10)
    const year = parseInt(yearStr, 10)

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return NextResponse.json({ error: "Invalid month/year" }, { status: 400 })
    }

    const body = await req.json()
    const { entries } = body as { entries: EmployeeEntry[] }

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: "No entries provided" }, { status: 400 })
    }

    // Verify all employees belong to this agent
    const employeeIds = entries.map((e) => e.employeeId)
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, agentId: agentId },
      include: {
        dispatcher: {
          select: {
            salaryRecords: {
              where: { month, year },
              select: {
                baseSalary: true,
                bonusTierEarnings: true,
                petrolSubsidy: true,
                penalty: true,
                advance: true,
              },
              take: 1,
            },
          },
        },
      },
    })

    if (employees.length !== employeeIds.length) {
      return NextResponse.json({ error: "One or more employees not found" }, { status: 404 })
    }

    const employeeMap = new Map(employees.map((e) => [e.id, e]))

    // Calculate and upsert all records in a transaction
    const records = await prisma.$transaction(
      entries.map((entry) => {
        const emp = employeeMap.get(entry.employeeId)!
        const dispatcherRecord = emp.dispatcher?.salaryRecords?.[0]

        const dispatcherGross = dispatcherRecord
          ? dispatcherRecord.baseSalary +
            dispatcherRecord.bonusTierEarnings +
            dispatcherRecord.petrolSubsidy
          : 0

        const employeeGross =
          emp.type === "STORE_KEEPER"
            ? calculateStoreKeeperGross(
                entry.workingHours,
                entry.hourlyWage,
                entry.petrolAllowance,
                entry.kpiAllowance,
                entry.otherAllowance
              )
            : calculateSupervisorGross(
                entry.basicPay,
                entry.petrolAllowance,
                entry.kpiAllowance,
                entry.otherAllowance,
                entry.workingHours,
                entry.hourlyWage
              )

        const totalGross = employeeGross + dispatcherGross
        const statutory = calculateStatutory(totalGross)

        // Combined penalty/advance: dispatcher + manual employee entry
        const dispatcherPenalty = dispatcherRecord?.penalty ?? 0
        const dispatcherAdvance = dispatcherRecord?.advance ?? 0
        const penalty = entry.penalty + dispatcherPenalty
        const advance = entry.advance + dispatcherAdvance

        const netSalary = calculateNetSalary(
          totalGross,
          statutory,
          entry.pcb,
          penalty,
          advance
        )

        return prisma.employeeSalaryRecord.upsert({
          where: {
            employeeId_month_year: {
              employeeId: entry.employeeId,
              month,
              year,
            },
          },
          create: {
            employeeId: entry.employeeId,
            month,
            year,
            basicPay: entry.basicPay,
            workingHours: entry.workingHours,
            hourlyWage: entry.hourlyWage,
            kpiAllowance: entry.kpiAllowance,
            petrolAllowance: entry.petrolAllowance,
            otherAllowance: entry.otherAllowance,
            grossSalary: totalGross,
            ...statutory,
            pcb: entry.pcb,
            penalty,
            advance,
            netSalary,
          },
          update: {
            basicPay: entry.basicPay,
            workingHours: entry.workingHours,
            hourlyWage: entry.hourlyWage,
            kpiAllowance: entry.kpiAllowance,
            petrolAllowance: entry.petrolAllowance,
            otherAllowance: entry.otherAllowance,
            grossSalary: totalGross,
            ...statutory,
            pcb: entry.pcb,
            penalty,
            advance,
            netSalary,
          },
        })
      })
    )

    return NextResponse.json({ saved: records.length, month, year })
  } catch (err) {
    console.error("[employee-payroll] POST error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
