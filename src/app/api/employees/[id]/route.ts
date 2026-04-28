import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { getEffectiveAgentId } from "@/lib/impersonation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;

    // Verify employee belongs to this agent
    const employee = await prisma.employee.findFirst({
      where: { id, agentId: agentId },
      select: { id: true, type: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, extId, icNo, type, branchCode, basicPay, hourlyWage, petrolAllowance, kpiAllowance, otherAllowance, dispatcherId, epfNo, socsoNo, incomeTaxNo, isActive } = body as {
      name?: string;
      extId?: string | null;
      icNo?: string | null;
      type?: string;
      branchCode?: string | null;
      basicPay?: number;
      hourlyWage?: number;
      petrolAllowance?: number;
      kpiAllowance?: number;
      otherAllowance?: number;
      dispatcherId?: string | null;
      epfNo?: string | null;
      socsoNo?: string | null;
      incomeTaxNo?: string | null;
      isActive?: boolean;
    };

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    if (icNo !== undefined && icNo !== null && icNo.trim() && !/^\d{12}$/.test(icNo.trim())) {
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

    // Validate type enum
    const VALID_TYPES = ["SUPERVISOR", "ADMIN", "STORE_KEEPER", "DRIVER"] as const;
    if (type !== undefined && !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return NextResponse.json({ error: "Invalid employee type" }, { status: 400 });
    }

    // Validate numeric bounds
    const numericFields = { basicPay, hourlyWage, petrolAllowance, kpiAllowance, otherAllowance };
    for (const [field, val] of Object.entries(numericFields)) {
      if (val !== undefined && (typeof val !== "number" || val < 0 || val > 999999)) {
        return NextResponse.json({ error: `${field} must be between 0 and 999,999` }, { status: 400 });
      }
    }

    const effectiveType = type ?? employee.type;
    const safeIcNo = icNo !== undefined ? (icNo?.trim() || null) : undefined;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (extId !== undefined) updateData.extId = extId?.trim() || null;
    if (safeIcNo !== undefined) {
      updateData.icNo = safeIcNo;
      updateData.gender = safeIcNo ? deriveGender(safeIcNo) : "UNKNOWN";
    }
    if (type !== undefined) updateData.type = type;
    if (branchCode !== undefined) {
      if (!branchCode || !branchCode.trim()) {
        return NextResponse.json({ error: "Branch is required" }, { status: 400 });
      }
      const branch = await prisma.branch.findFirst({
        where: { code: branchCode.trim(), agentId: agentId },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "Branch not found" }, { status: 404 });
      }
      updateData.branchId = branch.id;
    }
    if (basicPay !== undefined) updateData.basicPay = effectiveType === "STORE_KEEPER" ? null : basicPay;
    if (hourlyWage !== undefined) updateData.hourlyWage = effectiveType === "STORE_KEEPER" ? hourlyWage : null;
    if (petrolAllowance !== undefined) updateData.petrolAllowance = petrolAllowance;
    if (kpiAllowance !== undefined) updateData.kpiAllowance = kpiAllowance;
    if (otherAllowance !== undefined) updateData.otherAllowance = otherAllowance;
    if (dispatcherId !== undefined) updateData.dispatcherId = dispatcherId;
    if (epfNo !== undefined) updateData.epfNo = epfNo?.trim() || null;
    if (socsoNo !== undefined) updateData.socsoNo = socsoNo?.trim() || null;
    if (incomeTaxNo !== undefined) updateData.incomeTaxNo = incomeTaxNo?.trim() || null;
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
      }
      updateData.isActive = isActive;
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        dispatcher: {
          select: { extId: true, branch: { select: { code: true } } },
        },
      },
    });

    // Sync IC to linked dispatcher if both are set (scoped by agentId)
    if (safeIcNo && updated.dispatcherId) {
      await prisma.dispatcher.updateMany({
        where: { id: updated.dispatcherId, branch: { agentId: agentId } },
        data: { icNo: safeIcNo, gender: deriveGender(safeIcNo) },
      });
    }

    // Invalidate overview caches if branch/active state could affect counts.
    if (branchCode !== undefined || isActive !== undefined) {
      revalidateTag("overview", { expire: 0 });
    }

    return NextResponse.json({ success: true, isComplete: !!updated.icNo });
  } catch (err) {
    console.error("[employees] PATCH error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const effective = await getEffectiveAgentId();
    if (!effective) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const agentId = effective.agentId;

    const { id } = await params;

    // Verify employee belongs to this agent
    const employee = await prisma.employee.findFirst({
      where: { id, agentId: agentId },
      select: { id: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.employee.delete({ where: { id } });
    revalidateTag("overview", { expire: 0 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[employees] DELETE error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
