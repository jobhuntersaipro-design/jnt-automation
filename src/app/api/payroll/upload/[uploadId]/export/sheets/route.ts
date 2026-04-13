import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, exportToGoogleSheets } from "@/lib/google-sheets";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;

  const upload = await verifyUploadOwnership(uploadId, session.user.id);
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
    accessToken = await getValidAccessToken(session.user.id);
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

  const records = await prisma.salaryRecord.findMany({
    where: { uploadId },
    include: {
      dispatcher: { select: { extId: true, name: true } },
    },
    orderBy: { dispatcher: { name: "asc" } },
  });

  const rows = records.map((r) => ({
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

  try {
    const spreadsheetUrl = await exportToGoogleSheets(
      accessToken,
      fullUpload.branch.code,
      fullUpload.month,
      fullUpload.year,
      rows,
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
