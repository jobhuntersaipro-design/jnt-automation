import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getEffectiveAgentId } from "@/lib/impersonation"

export async function GET() {
  try {
    const effective = await getEffectiveAgentId()
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const agentId = effective.agentId

    // Get all months with saved employee salary records for this agent
    const records = await prisma.employeeSalaryRecord.findMany({
      where: {
        employee: { agentId },
      },
      select: {
        month: true,
        year: true,
        netSalary: true,
        grossSalary: true,
      },
    })

    // Group by month/year
    const grouped = new Map<string, { month: number; year: number; totalNet: number; totalGross: number; count: number }>()
    for (const r of records) {
      const key = `${r.year}-${r.month}`
      const existing = grouped.get(key)
      if (existing) {
        existing.totalNet += r.netSalary
        existing.totalGross += r.grossSalary
        existing.count += 1
      } else {
        grouped.set(key, {
          month: r.month,
          year: r.year,
          totalNet: r.netSalary,
          totalGross: r.grossSalary,
          count: 1,
        })
      }
    }

    const history = Array.from(grouped.values()).sort(
      (a, b) => b.year - a.year || b.month - a.month
    )

    return NextResponse.json({ history })
  } catch (err) {
    console.error("[employee-payroll/history] GET error", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
