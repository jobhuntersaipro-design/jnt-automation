import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, exportToGoogleSheets } from "@/lib/google-sheets";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await auth();

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

  // Get valid access token
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session!.user!.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "NOT_CONNECTED") {
      return NextResponse.json(
        { error: "NOT_CONNECTED", connectUrl: "/api/auth/google-sheets/connect" },
        { status: 401 },
      );
    }
    if (message === "TOKEN_REVOKED") {
      return NextResponse.json(
        { error: "TOKEN_REVOKED", message: "Google Sheets connection lost. Reconnect in Settings." },
        { status: 401 },
      );
    }
    throw error;
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

  // Fetch salary records with line items for per-dispatcher tabs
  const records = await prisma.salaryRecord.findMany({
    where: { uploadId },
    include: {
      dispatcher: { select: { extId: true, name: true } },
      lineItems: {
        select: {
          waybillNumber: true,
          weight: true,
          deliveryDate: true,
        },
        orderBy: { weight: "asc" },
      },
    },
    orderBy: { dispatcher: { name: "asc" } },
  });

  // Build summary rows (for the summary tab)
  const summaryRows = records.map((r) => ({
    extId: r.dispatcher.extId,
    name: r.dispatcher.name,
    branchCode: fullUpload.branch.code,
    totalOrders: r.totalOrders,
    baseSalary: r.baseSalary,
    incentive: r.incentive,
    petrolSubsidy: r.petrolSubsidy,
    penalty: r.penalty,
    advance: r.advance,
    netSalary: r.netSalary,
  }));

  // Build per-dispatcher line item data
  const dispatcherTabs = records.map((r) => ({
    name: r.dispatcher.name,
    lineItems: r.lineItems.map((li) => ({
      orderDate: li.deliveryDate
        ? li.deliveryDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "",
      waybillNumber: li.waybillNumber,
      dispatcherName: r.dispatcher.name,
      weight: li.weight,
    })),
  }));

  try {
    const spreadsheetUrl = await exportToGoogleSheets(
      accessToken,
      fullUpload.branch.code,
      fullUpload.month,
      fullUpload.year,
      summaryRows,
      dispatcherTabs,
    );

    return NextResponse.json({ spreadsheetUrl });
  } catch (error) {
    console.error("Google Sheets export failed:", error);
    return NextResponse.json(
      { error: "Failed to export to Google Sheets. Please try again." },
      { status: 500 },
    );
  }
}
