import { redirect } from "next/navigation";
import { getSalaryRecordsByUpload } from "@/lib/db/payroll";
import { SalaryTable } from "@/components/payroll/salary-table";

export default async function DispatcherPayrollDetailPage({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const { getEffectiveAgentId } = await import("@/lib/impersonation");
  const effective = await getEffectiveAgentId();
  if (!effective) redirect("/auth/login");

  const { uploadId } = await params;
  const data = await getSalaryRecordsByUpload(uploadId, effective.agentId);

  if (!data) redirect("/dispatchers?tab=payroll");

  return (
    <main className="flex-1 overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <SalaryTable
        uploadId={data.upload.id}
        branchCode={data.upload.branchCode}
        month={data.upload.month}
        year={data.upload.year}
        initialRecords={data.records}
        initialSummary={data.summary}
      />
    </main>
  );
}
