import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { getEmployees } from "@/lib/db/employees";
import { getEffectiveAgentId } from "@/lib/impersonation";
import type { EmployeeType } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const url = new URL(req.url);
    const type = url.searchParams.get("type") as EmployeeType | null;
    const search = url.searchParams.get("search") || undefined;

    const employees = await getEmployees(agentId, {
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
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const body = await req.json();
    const { name, extId, icNo, type, branchCode, dispatcherId, epfNo, socsoNo, incomeTaxNo } = body as {
      name?: string;
      extId?: string;
      icNo?: string;
      type?: EmployeeType;
      branchCode?: string;
      dispatcherId?: string;
      epfNo?: string;
      socsoNo?: string;
      incomeTaxNo?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!type || !["SUPERVISOR", "ADMIN", "STORE_KEEPER", "DRIVER"].includes(type)) {
      return NextResponse.json({ error: "Valid employee type is required" }, { status: 400 });
    }

    if (!branchCode || !branchCode.trim()) {
      return NextResponse.json({ error: "Branch is required" }, { status: 400 });
    }

    if (icNo && icNo.trim() && !/^\d{12}$/.test(icNo.trim())) {
      return NextResponse.json({ error: "IC number must be 12 digits" }, { status: 400 });
    }

    // Validate dispatcher link belongs to agent
    if (dispatcherId) {
      const dispatcher = await prisma.dispatcher.findFirst({
        where: { id: dispatcherId, branch: { agentId: agentId } },
        select: { id: true },
      });
      if (!dispatcher) {
        return NextResponse.json({ error: "Dispatcher not found" }, { status: 404 });
      }
    }

    const safeIcNo = icNo?.trim() || null;
    const gender = safeIcNo ? deriveGender(safeIcNo) : ("UNKNOWN" as const);

    // Resolve branchCode to branchId (required)
    const branch = await prisma.branch.findFirst({
      where: { code: branchCode.trim(), agentId: agentId },
      select: { id: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }
    const branchId = branch.id;

    const employee = await prisma.employee.create({
      data: {
        agentId: agentId,
        extId: extId?.trim() || null,
        name: name.trim(),
        icNo: safeIcNo,
        gender,
        type,
        branchId,
        dispatcherId: dispatcherId || null,
        epfNo: epfNo?.trim() || null,
        socsoNo: socsoNo?.trim() || null,
        incomeTaxNo: incomeTaxNo?.trim() || null,
      },
      include: {
        branch: { select: { code: true } },
        dispatcher: {
          select: { extId: true, avatarUrl: true, branch: { select: { code: true } } },
        },
      },
    });

    // Invalidate overview caches so the new staff member appears in the
    // Total People + Branch Distribution counts on next dashboard render.
    revalidateTag("overview", { expire: 0 });

    return NextResponse.json({
      employee: {
        id: employee.id,
        extId: employee.extId ?? "",
        name: employee.name,
        icNo: employee.icNo ?? "",
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
        epfNo: employee.epfNo,
        socsoNo: employee.socsoNo,
        incomeTaxNo: employee.incomeTaxNo,
        dispatcherId: employee.dispatcherId,
        dispatcherExtId: employee.dispatcher?.extId ?? null,
        dispatcherBranch: employee.dispatcher?.branch?.code ?? null,
        dispatcherAvatarUrl: employee.dispatcher?.avatarUrl ?? null,
        isComplete: !!employee.icNo,
        isActive: employee.isActive,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("[employees] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
