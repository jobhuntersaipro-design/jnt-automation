import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { getEmployees } from "@/lib/db/employees";
import type { EmployeeType } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.isApproved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type") as EmployeeType | null;
    const search = url.searchParams.get("search") || undefined;

    const employees = await getEmployees(session.user.id, {
      type: type || undefined,
      search,
    });

    return NextResponse.json({ employees });
  } catch (err) {
    console.error("[employees] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.isApproved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, extId, icNo, type, branchCode, basicPay, hourlyWage, petrolAllowance, kpiAllowance, otherAllowance, dispatcherId } = body as {
      name?: string;
      extId?: string;
      icNo?: string;
      type?: EmployeeType;
      branchCode?: string;
      basicPay?: number;
      hourlyWage?: number;
      petrolAllowance?: number;
      kpiAllowance?: number;
      otherAllowance?: number;
      dispatcherId?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!type || !["SUPERVISOR", "ADMIN", "STORE_KEEPER"].includes(type)) {
      return NextResponse.json({ error: "Valid employee type is required" }, { status: 400 });
    }

    if (type === "STORE_KEEPER" && (hourlyWage === undefined || hourlyWage === null)) {
      return NextResponse.json({ error: "Hourly wage is required for Store Keeper" }, { status: 400 });
    }

    if ((type === "SUPERVISOR" || type === "ADMIN") && (basicPay === undefined || basicPay === null)) {
      return NextResponse.json({ error: "Basic pay is required for Supervisor/Admin" }, { status: 400 });
    }

    // Validate numeric bounds
    const numericFields = { basicPay, hourlyWage, petrolAllowance, kpiAllowance, otherAllowance };
    for (const [field, val] of Object.entries(numericFields)) {
      if (val !== undefined && val !== null && (typeof val !== "number" || val < 0 || val > 999999)) {
        return NextResponse.json({ error: `${field} must be between 0 and 999,999` }, { status: 400 });
      }
    }

    if (icNo && icNo.trim() && !/^\d{12}$/.test(icNo.trim())) {
      return NextResponse.json({ error: "IC number must be 12 digits" }, { status: 400 });
    }

    // Validate dispatcher link belongs to agent
    if (dispatcherId) {
      const dispatcher = await prisma.dispatcher.findFirst({
        where: { id: dispatcherId, branch: { agentId: session.user.id } },
        select: { id: true },
      });
      if (!dispatcher) {
        return NextResponse.json({ error: "Dispatcher not found" }, { status: 404 });
      }
    }

    const safeIcNo = icNo?.trim() || null;
    const gender = safeIcNo ? deriveGender(safeIcNo) : ("UNKNOWN" as const);

    // Resolve branchCode to branchId
    let branchId: string | null = null;
    if (branchCode) {
      const branch = await prisma.branch.findFirst({
        where: { code: branchCode, agentId: session.user.id },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      }
      branchId = branch.id;
    }

    const employee = await prisma.employee.create({
      data: {
        agentId: session.user.id,
        extId: extId?.trim() || null,
        name: name.trim(),
        icNo: safeIcNo,
        gender,
        type,
        branchId,
        basicPay: type === "STORE_KEEPER" ? null : (basicPay ?? 0),
        hourlyWage: type === "STORE_KEEPER" ? (hourlyWage ?? 0) : null,
        petrolAllowance: petrolAllowance ?? 0,
        kpiAllowance: kpiAllowance ?? 0,
        otherAllowance: otherAllowance ?? 0,
        dispatcherId: dispatcherId || null,
      },
      include: {
        branch: { select: { code: true } },
        dispatcher: {
          select: { extId: true, branch: { select: { code: true } } },
        },
      },
    });

    return NextResponse.json({
      employee: {
        id: employee.id,
        extId: employee.extId ?? "",
        name: employee.name,
        icNo: employee.icNo ? "••••••••" + employee.icNo.slice(-4) : "",
        rawIcNo: employee.icNo ?? "",
        gender: employee.gender,
        avatarUrl: employee.avatarUrl,
        type: employee.type,
        branchCode: employee.branch?.code ?? null,
        basicPay: employee.basicPay,
        hourlyWage: employee.hourlyWage,
        petrolAllowance: employee.petrolAllowance,
        kpiAllowance: employee.kpiAllowance,
        otherAllowance: employee.otherAllowance,
        dispatcherId: employee.dispatcherId,
        dispatcherExtId: employee.dispatcher?.extId ?? null,
        dispatcherBranch: employee.dispatcher?.branch?.code ?? null,
        isComplete: !!employee.icNo,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[employees] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
