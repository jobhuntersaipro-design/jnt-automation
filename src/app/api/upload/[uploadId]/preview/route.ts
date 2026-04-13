import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyUploadOwnership } from "@/lib/db/upload";
import { getPreviewData, updatePreviewData } from "@/lib/upload/pipeline";

export interface PreviewSummary {
  totalNetPayout: number;
  totalBaseSalary: number;
  totalIncentive: number;
  totalPetrolSubsidy: number;
  totalDeductions: number;
  dispatcherCount: number;
}

function computeSummary(results: { baseSalary: number; incentive: number; petrolSubsidy: number; penalty: number; advance: number; netSalary: number }[]): PreviewSummary {
  return {
    totalNetPayout: results.reduce((sum, r) => sum + r.netSalary, 0),
    totalBaseSalary: results.reduce((sum, r) => sum + r.baseSalary, 0),
    totalIncentive: results.reduce((sum, r) => sum + r.incentive, 0),
    totalPetrolSubsidy: results.reduce((sum, r) => sum + r.petrolSubsidy, 0),
    totalDeductions: results.reduce((sum, r) => sum + r.penalty + r.advance, 0),
    dispatcherCount: results.length,
  };
}

export async function GET(
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

  if (upload.status !== "READY_TO_CONFIRM") {
    return NextResponse.json(
      { error: `Cannot view preview in ${upload.status} state` },
      { status: 409 },
    );
  }

  const preview = await getPreviewData(uploadId);
  if (!preview) {
    return NextResponse.json(
      { error: "Preview data expired. Please re-upload the file." },
      { status: 410 },
    );
  }

  const summary = computeSummary(preview.results);

  return NextResponse.json({
    results: preview.results,
    summary,
    unknownDispatchers: preview.unknownDispatchers,
  });
}

export async function PATCH(
  req: NextRequest,
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

  if (upload.status !== "READY_TO_CONFIRM") {
    return NextResponse.json(
      { error: `Cannot update preview in ${upload.status} state` },
      { status: 409 },
    );
  }

  const body = await req.json();
  const { dispatcherId, penalty, advance } = body as {
    dispatcherId: string;
    penalty: number;
    advance: number;
  };

  if (typeof penalty !== "number" || typeof advance !== "number" || penalty < 0 || advance < 0 || penalty > 99999.99 || advance > 99999.99) {
    return NextResponse.json({ error: "Invalid penalty or advance value" }, { status: 400 });
  }

  const preview = await getPreviewData(uploadId);
  if (!preview) {
    return NextResponse.json(
      { error: "Preview data expired. Please re-upload the file." },
      { status: 410 },
    );
  }

  // Find and update the dispatcher's result
  const idx = preview.results.findIndex((r) => r.dispatcherId === dispatcherId);
  if (idx === -1) {
    return NextResponse.json({ error: "Dispatcher not found in preview" }, { status: 404 });
  }

  const result = preview.results[idx];
  result.penalty = penalty;
  result.advance = advance;
  result.netSalary = Math.round(
    (result.baseSalary + result.incentive + result.petrolSubsidy - penalty - advance) * 100,
  ) / 100;

  await updatePreviewData(uploadId, preview);

  const summary = computeSummary(preview.results);

  return NextResponse.json({
    updatedNetSalary: result.netSalary,
    updatedSummary: summary,
  });
}
