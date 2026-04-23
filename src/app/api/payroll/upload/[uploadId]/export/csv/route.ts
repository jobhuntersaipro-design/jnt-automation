import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { generatePayrollCSV } from "@/lib/payroll/csv-generator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, effective.agentId);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "SAVED") {
    return NextResponse.json(
      { error: `Cannot export in ${upload.status} state` },
      { status: 409 },
    );
  }

  const fullUpload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      month: true,
      year: true,
      branch: { select: { code: true } },
    },
  });

  if (!fullUpload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const records = await prisma.salaryRecord.findMany({
    where: { uploadId },
    include: {
      dispatcher: { select: { extId: true, name: true } },
    },
    orderBy: { dispatcher: { name: "asc" } },
  });

  const csvRows = records.map((r) => ({
    extId: r.dispatcher.extId,
    name: r.dispatcher.name,
    branchCode: fullUpload.branch.code,
    totalOrders: r.totalOrders,
    baseSalary: r.baseSalary,
    bonusTierEarnings: r.bonusTierEarnings,
    petrolSubsidy: r.petrolSubsidy,
    commission: r.commission,
    penalty: r.penalty,
    advance: r.advance,
    netSalary: r.netSalary,
  }));

  const csv = generatePayrollCSV(csvRows);
  const monthStr = String(fullUpload.month).padStart(2, "0");
  const fileName = `payroll_${fullUpload.branch.code}_${monthStr}_${fullUpload.year}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
