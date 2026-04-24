import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db/notifications";
import { getJob, updateJob } from "@/lib/staff/bulk-job";
import { streamZipToR2 } from "@/lib/staff/streaming-zip";
import { generatePayslipPdf } from "./pdf-generator";
import { runPool } from "@/lib/upload/run-pool";

const PAYSLIP_CONCURRENCY = 4;

/**
 * Background worker for bulk dispatcher-payslip generation. Mirrors the
 * month-detail worker: streams stage + progress onto the Redis job record,
 * uploads the final zip to R2, drops a notification, and flips the job to
 * `done` / `failed` so the UI's poll observes the transition.
 *
 * Fire-and-forget — errors are captured onto the job, not thrown.
 */
export async function runPayslipBulkExport(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) {
    console.error(`[payslip-bulk] job ${jobId} not found`);
    return;
  }

  if (!job.uploadId || !job.dispatcherIds || job.dispatcherIds.length === 0) {
    await updateJob(jobId, {
      status: "failed",
      error: "Missing upload or dispatcher selection",
    });
    return;
  }

  try {
    await updateJob(jobId, {
      status: "running",
      stage: "fetching",
      startedAt: Date.now(),
    });

    const [upload, agent, salaryRecords] = await Promise.all([
      prisma.upload.findUnique({
        where: { id: job.uploadId },
        select: {
          month: true,
          year: true,
          branch: { select: { code: true, agentId: true } },
        },
      }),
      prisma.agent.findUnique({
        where: { id: job.agentId },
        select: {
          name: true,
          companyRegistrationNo: true,
          companyAddress: true,
          stampImageUrl: true,
        },
      }),
      prisma.salaryRecord.findMany({
        where: {
          uploadId: job.uploadId,
          dispatcherId: { in: job.dispatcherIds },
          dispatcher: { branch: { agentId: job.agentId } },
        },
        include: {
          dispatcher: { select: { name: true, extId: true, icNo: true } },
          lineItems: { select: { weight: true, commission: true, isBonusTier: true } },
        },
      }),
    ]);

    if (!upload || upload.branch.agentId !== job.agentId) {
      await updateJob(jobId, { status: "failed", error: "Upload not found" });
      return;
    }
    if (!agent) {
      await updateJob(jobId, { status: "failed", error: "Agent not found" });
      return;
    }
    if (salaryRecords.length === 0) {
      await updateJob(jobId, {
        status: "failed",
        error: "No salary records for the selected dispatchers",
      });
      return;
    }

    await updateJob(jobId, { total: salaryRecords.length, stage: "generating" });

    type Generated = { fileName: string; data: Uint8Array };
    let completed = 0;

    const raw = await runPool<typeof salaryRecords[number], Generated | null>(
      salaryRecords,
      PAYSLIP_CONCURRENCY,
      async (record) => {
        try {
          const weightTiersSnapshot = (record.weightTiersSnapshot ?? []) as Array<{
            tier: number;
            minWeight: number;
            maxWeight: number | null;
            commission: number;
          }>;
          const bonusSnapshot = record.bonusTierSnapshot as
            | {
                orderThreshold: number;
                tiers: Array<{
                  tier: number;
                  minWeight: number;
                  maxWeight: number | null;
                  commission: number;
                }>;
              }
            | null;
          const bonusTierSnapshot = bonusSnapshot?.tiers ?? [];

          const buffer = await generatePayslipPdf({
            companyName: agent.name,
            companyRegistrationNo: agent.companyRegistrationNo,
            companyAddress: agent.companyAddress,
            stampImageUrl: agent.stampImageUrl,
            dispatcherName: record.dispatcher.name,
            icNo: record.dispatcher.icNo ?? "",
            month: upload.month,
            year: upload.year,
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
          const monthStr = String(upload.month).padStart(2, "0");
          const fileName = `${upload.branch.code}_${safeName}_${monthStr}_${upload.year}.pdf`;

          completed++;
          // Per-file progress + label for the Downloads Panel.
          await updateJob(jobId, {
            done: completed,
            currentLabel: record.dispatcher.name,
          });
          return { fileName, data: new Uint8Array(buffer) };
        } catch (err) {
          console.error(`[payslip-bulk] skipping ${record.dispatcher.extId}:`, err);
          completed++;
          return null;
        }
      },
    );

    const files = raw.filter((f): f is Generated => f !== null);

    await updateJob(jobId, { stage: "zipping" });
    const mm = String(upload.month).padStart(2, "0");
    const r2Key = `bulk-exports/${job.agentId}/${job.jobId}/payslips_${upload.branch.code}_${mm}_${upload.year}.zip`;
    await updateJob(jobId, { stage: "uploading" });
    await streamZipToR2(r2Key, files);

    const monthName = new Date(upload.year, upload.month - 1).toLocaleString("en", {
      month: "long",
    });
    await createNotification({
      agentId: job.agentId,
      type: "payroll",
      message: "Bulk payslip export ready",
      detail: `${monthName} ${upload.year} · ${files.length} payslip${
        files.length !== 1 ? "s" : ""
      } · ${upload.branch.code}`,
    }).catch(() => {});

    await updateJob(jobId, {
      status: "done",
      stage: "done",
      done: files.length,
      total: salaryRecords.length,
      r2Key,
    });
  } catch (err) {
    console.error(`[payslip-bulk] job ${jobId} failed:`, err);
    const message = err instanceof Error ? err.message : "Payslip export failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}

export function dispatchPayslipBulk(jobId: string): void {
  Promise.resolve()
    .then(() => runPayslipBulkExport(jobId))
    .catch((e) => console.error("[payslip-bulk] dispatch failed:", e));
}
