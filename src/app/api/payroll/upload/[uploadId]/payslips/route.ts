import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { generatePayslipPdf } from "@/lib/payroll/pdf-generator";
import { generatePayslipZip } from "@/lib/payroll/zip-generator";
import { runPool } from "@/lib/upload/run-pool";

// PDF generation is CPU-bound; 4 matches the bulk payslip worker bound —
// pdfkit is imperative so higher concurrency saturates the event loop without
// OOMing, but 4 keeps memory headroom on the 1 GB serverless Lambdas.
const PAYSLIP_CONCURRENCY = 4;

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
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
      { error: `Cannot generate payslips in ${upload.status} state` },
      { status: 409 },
    );
  }

  const body = await req.json();
  const dispatcherIds: string[] = body.dispatcherIds;

  if (!Array.isArray(dispatcherIds) || dispatcherIds.length === 0) {
    return NextResponse.json({ error: "No dispatchers selected" }, { status: 400 });
  }

  if (dispatcherIds.length > 50) {
    return NextResponse.json(
      { error: "Cannot generate more than 50 payslips at once" },
      { status: 400 },
    );
  }

  try {
    // Load upload details
    const fullUpload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: {
        month: true,
        year: true,
        branch: { select: { code: true, agentId: true } },
      },
    });

    if (!fullUpload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Load agent company info
    const agent = await prisma.agent.findUnique({
      where: { id: effective.agentId },
      select: {
        name: true,
        companyRegistrationNo: true,
        companyAddress: true,
        stampImageUrl: true,
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Load salary records with line items
    const salaryRecords = await prisma.salaryRecord.findMany({
      where: {
        uploadId,
        dispatcherId: { in: dispatcherIds },
        dispatcher: { branch: { agentId: effective.agentId } },
      },
      include: {
        dispatcher: {
          select: { name: true, extId: true, icNo: true },
        },
        lineItems: {
          select: { weight: true, commission: true, isBonusTier: true },
        },
      },
    });

    // Generate PDFs in a bounded parallel pool. PDF rendering is CPU-bound,
    // so concurrency 4 gives ~4x speedup without saturating the event loop.
    const payslipFiles = await runPool(
      salaryRecords,
      PAYSLIP_CONCURRENCY,
      async (record) => {
        const weightTiersSnapshot = (record.weightTiersSnapshot ?? []) as Array<{
          tier: number;
          minWeight: number;
          maxWeight: number | null;
          commission: number;
        }>;
        const bonusSnapshot = record.bonusTierSnapshot as
          | { orderThreshold: number; tiers: Array<{ tier: number; minWeight: number; maxWeight: number | null; commission: number }> }
          | null;
        const bonusTierSnapshot = bonusSnapshot?.tiers ?? [];

        const buffer = await generatePayslipPdf({
          companyName: agent.name,
          companyRegistrationNo: agent.companyRegistrationNo,
          companyAddress: agent.companyAddress,
          stampImageUrl: agent.stampImageUrl,
          dispatcherName: record.dispatcher.name,
          icNo: record.dispatcher.icNo ?? "",
          month: fullUpload.month,
          year: fullUpload.year,
          petrolSubsidy: record.petrolSubsidy,
          commission: record.commission,
          penalty: record.penalty,
          advance: record.advance,
          netSalary: record.netSalary,
          lineItems: record.lineItems,
          weightTiersSnapshot,
          bonusTierSnapshot,
        });

        const safeName = record.dispatcher.name.replace(/[^a-zA-Z0-9]/g, "_");
        const monthStr = String(fullUpload.month).padStart(2, "0");
        const fileName = `${fullUpload.branch.code}_${safeName}_${monthStr}_${fullUpload.year}.pdf`;
        return { fileName, buffer };
      },
    );

    // If single payslip, return PDF directly
    if (payslipFiles.length === 1) {
      return new NextResponse(new Uint8Array(payslipFiles[0].buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${payslipFiles[0].fileName}"`,
        },
      });
    }

    // Multiple payslips — ZIP them
    const zipBuffer = await generatePayslipZip(payslipFiles);
    const monthStr = String(fullUpload.month).padStart(2, "0");
    const zipName = `payslips_${fullUpload.branch.code}_${monthStr}_${fullUpload.year}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate payslips:", error);
    return NextResponse.json(
      { error: "Failed to generate payslips. Please try again." },
      { status: 500 },
    );
  }
}
