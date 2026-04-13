import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getSalaryRecordsByUpload } from "@/lib/db/payroll";
import { SalaryTable } from "@/components/payroll/salary-table";

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isApproved) redirect("/auth/login");

  const { uploadId } = await params;
  const data = await getSalaryRecordsByUpload(uploadId, session.user.id);

  if (!data) redirect("/payroll");

  return (
    <main className="flex-1 overflow-y-auto px-16 py-8">
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
