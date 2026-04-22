import { NextRequest, NextResponse } from "next/server";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import {
  getValidAccessToken,
  exportDispatcherHistoryToSheets,
} from "@/lib/google-sheets";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveAgentId();
  if (!effective) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const dispatcher = await prisma.dispatcher.findFirst({
    where: { id, branch: { agentId: effective.agentId } },
    select: {
      extId: true,
      name: true,
      branch: { select: { code: true } },
    },
  });

  if (!dispatcher) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(effective.agentId);
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

  const records = await prisma.salaryRecord.findMany({
    where: { dispatcherId: id },
    select: {
      month: true,
      year: true,
      totalOrders: true,
      baseSalary: true,
      incentive: true,
      petrolSubsidy: true,
      petrolQualifyingDays: true,
      penalty: true,
      advance: true,
      netSalary: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  if (records.length === 0) {
    return NextResponse.json({ error: "No salary records to export" }, { status: 400 });
  }

  const rows = records.map((r) => ({
    month: r.month,
    year: r.year,
    totalOrders: r.totalOrders,
    baseSalary: r.baseSalary,
    incentive: r.incentive,
    petrolSubsidy: r.petrolSubsidy,
    petrolQualifyingDays: r.petrolQualifyingDays,
    penalty: r.penalty,
    advance: r.advance,
    netSalary: r.netSalary,
    wasRecalculated: r.updatedAt.getTime() > r.createdAt.getTime() + 1000,
  }));

  try {
    const spreadsheetUrl = await exportDispatcherHistoryToSheets(
      accessToken,
      {
        name: dispatcher.name,
        extId: dispatcher.extId,
        branchCode: dispatcher.branch.code,
      },
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
