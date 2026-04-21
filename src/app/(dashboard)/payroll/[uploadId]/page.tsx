import { redirect } from "next/navigation";

export default async function PayrollDetailRedirect({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const { uploadId } = await params;
  redirect(`/dispatchers/payroll/${uploadId}`);
}
