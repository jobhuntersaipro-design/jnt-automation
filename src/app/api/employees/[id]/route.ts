import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { getEffectiveAgentId } from "@/lib/impersonation";
import type { StoreKeeperSubtype } from "@/generated/prisma/client";
import {
  isValidEmployeeType,
  validateEmployeeSubtype,
  usesUnitsRate,
  EMPLOYEE_TYPE_VALUES,
  type EmployeeTypeName,
} from "@/lib/staff/employee-subtype";

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
      select: { id: true, type: true, subtype: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      name,
      extId,
      icNo,
      type,
      subtype: rawSubtype,
      // Legacy field names — older client bundles still send these.
      storeKeeperSubtype: legacySkSubtype,
      adminSubtype: legacyAdminSubtype,
      branchCode,
      basicPay,
      hourlyWage,
      petrolAllowance,
      kpiAllowance,
      otAllowance,
      otherAllowance,
      dispatcherId,
      epfNo,
      socsoNo,
      incomeTaxNo,
      isActive,
    } = body as {
      name?: string;
      extId?: string | null;
      icNo?: string | null;
      type?: string;
      subtype?: StoreKeeperSubtype | null;
      storeKeeperSubtype?: StoreKeeperSubtype | null;
      adminSubtype?: StoreKeeperSubtype | null;
      branchCode?: string | null;
      basicPay?: number;
      hourlyWage?: number;
      petrolAllowance?: number;
      kpiAllowance?: number;
      otAllowance?: number;
      otherAllowance?: number;
      dispatcherId?: string | null;
      epfNo?: string | null;
      socsoNo?: string | null;
      incomeTaxNo?: string | null;
      isActive?: boolean;
    };

    // Merge legacy field names into the universal `subtype`. `undefined`
    // means "field not present in payload" — preserve DB value. Explicit
    // `null` or a value overrides.
    const subtype: StoreKeeperSubtype | null | undefined =
      rawSubtype !== undefined
        ? rawSubtype
        : legacySkSubtype !== undefined
        ? legacySkSubtype
        : legacyAdminSubtype !== undefined
        ? legacyAdminSubtype
        : undefined;

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
    if (type !== undefined && !isValidEmployeeType(type)) {
      return NextResponse.json(
        { error: `Invalid employee type (one of: ${EMPLOYEE_TYPE_VALUES.join(", ")})` },
        { status: 400 },
      );
    }

    // Validate the (possibly merged) universal subtype value.
    if (subtype !== undefined) {
      const subtypeCheck = validateEmployeeSubtype(subtype);
      if (!subtypeCheck.ok) {
        return NextResponse.json({ error: subtypeCheck.error }, { status: 400 });
      }
    }

    // Validate numeric bounds
    const numericFields = { basicPay, hourlyWage, petrolAllowance, kpiAllowance, otAllowance, otherAllowance };
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
    // The Employee.basicPay / Employee.hourlyWage columns are templates for
    // the per-month payroll table — the per-month EmployeeSalaryRecord is
    // what actually drives statutory math. We only persist these template
    // fields when the row's effective pay model can use them. The pay model
    // is decided by the universal `usesUnitsRate` helper (see
    // `lib/staff/employee-subtype.ts`) — TEMPORARY on any role uses hours
    // × rate, PERMANENT on any role uses basicPay.
    const effectiveSubtype = subtype !== undefined ? subtype : employee.subtype;
    const effectiveUsesUnitsRate = usesUnitsRate(
      effectiveType as EmployeeTypeName,
      effectiveSubtype,
    );

    if (basicPay !== undefined) updateData.basicPay = effectiveUsesUnitsRate ? null : basicPay;
    if (hourlyWage !== undefined) updateData.hourlyWage = effectiveUsesUnitsRate ? hourlyWage : null;

    // Subtype is universal — no per-role auto-clear. When the payload sends
    // an explicit value (including null), persist it; when omitted, leave
    // the existing DB value alone.
    if (subtype !== undefined) updateData.subtype = subtype;
    if (petrolAllowance !== undefined) updateData.petrolAllowance = petrolAllowance;
    if (kpiAllowance !== undefined) updateData.kpiAllowance = kpiAllowance;
    if (otAllowance !== undefined) updateData.otAllowance = otAllowance;
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
