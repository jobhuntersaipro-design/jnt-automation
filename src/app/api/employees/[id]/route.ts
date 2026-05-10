import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { deriveGender } from "@/lib/utils/gender";
import { getEffectiveAgentId } from "@/lib/impersonation";
import type { StoreKeeperSubtype } from "@/generated/prisma/client";
import {
  validateSubtypeForType,
  resolveSubtypeUpdate,
  type EmployeeTypeName,
} from "@/lib/staff/store-keeper-subtype";
import {
  validateAdminSubtypeForType,
  resolveAdminSubtypeUpdate,
} from "@/lib/staff/admin-subtype";

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
      select: { id: true, type: true, storeKeeperSubtype: true, adminSubtype: true },
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
      storeKeeperSubtype,
      adminSubtype,
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

    // Validate subtype against the effective type. We use whatever the
    // PATCH will end up with — explicit type from payload, or the existing
    // employee.type when type is not being updated.
    if (storeKeeperSubtype !== undefined) {
      const effectiveTypeForCheck = (type ?? employee.type) as EmployeeTypeName;
      const subtypeCheck = validateSubtypeForType(effectiveTypeForCheck, storeKeeperSubtype);
      if (!subtypeCheck.ok) {
        return NextResponse.json({ error: subtypeCheck.error }, { status: 400 });
      }
    }

    if (adminSubtype !== undefined) {
      const effectiveTypeForCheck = (type ?? employee.type) as EmployeeTypeName;
      const subtypeCheck = validateAdminSubtypeForType(effectiveTypeForCheck, adminSubtype);
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
    // depends on subtype:
    //   - STORE_KEEPER: hourlyWage applies (Permanent SK still has the column
    //     templated to null because Permanent SK uses basicPay at runtime).
    //   - ADMIN + Temporary: hourlyWage applies.
    //   - Everyone else (Sup/Driver/Permanent SK/Permanent or untagged Admin):
    //     basicPay applies.
    const effectiveAdminSubtype =
      adminSubtype !== undefined ? adminSubtype : employee.adminSubtype;
    const effectiveStoreKeeperSubtype =
      storeKeeperSubtype !== undefined ? storeKeeperSubtype : employee.storeKeeperSubtype;
    const effectiveUsesUnitsRate =
      (effectiveType === "STORE_KEEPER" && effectiveStoreKeeperSubtype !== "PERMANENT") ||
      (effectiveType === "ADMIN" && effectiveAdminSubtype === "TEMPORARY");

    if (basicPay !== undefined) updateData.basicPay = effectiveUsesUnitsRate ? null : basicPay;
    if (hourlyWage !== undefined) updateData.hourlyWage = effectiveUsesUnitsRate ? hourlyWage : null;

    // Auto-clear subtype when leaving STORE_KEEPER. If the caller explicitly
    // passed a subtype value (even when staying STORE_KEEPER), persist that.
    // If only `type` is changing TO STORE_KEEPER without an accompanying
    // subtype, leave the column alone — the drawer's required-field check
    // covers UX completeness.
    if (type !== undefined && type !== "STORE_KEEPER") {
      // Type is leaving STORE_KEEPER → force null regardless of payload.
      updateData.storeKeeperSubtype = null;
    } else if (storeKeeperSubtype !== undefined) {
      const next = resolveSubtypeUpdate({
        effectiveType: effectiveType as EmployeeTypeName,
        payloadSubtype: storeKeeperSubtype,
      });
      if (next !== undefined) updateData.storeKeeperSubtype = next;
    }

    // Symmetric auto-clear for adminSubtype when leaving ADMIN.
    if (type !== undefined && type !== "ADMIN") {
      updateData.adminSubtype = null;
    } else if (adminSubtype !== undefined) {
      const next = resolveAdminSubtypeUpdate({
        effectiveType: effectiveType as EmployeeTypeName,
        payloadSubtype: adminSubtype,
      });
      if (next !== undefined) updateData.adminSubtype = next;
    }
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
