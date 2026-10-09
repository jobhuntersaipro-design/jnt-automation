import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Payslips, SLIP_LANGS, type SlipLang } from "@/components/v2/payslip/payslips";
import { prisma } from "@/lib/prisma";
import { periodToInput } from "@/lib/v2/pay/resolve";
import { readPayslipToken } from "@/lib/v2/payslip/link";
import { getRunView } from "@/lib/v2/payroll/data";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

/** The result behind a payslip link, only once its run is finalised. */
async function find(token: string) {
  const id = readPayslipToken(decodeURIComponent(token));
  if (!id) return null;
  return prisma.payrollResult.findFirst({
    where: { id, run: { status: "FINAL" } },
    select: { id: true, name: true, run: { select: { id: true, agentId: true, period: true, branch: { select: { code: true } } } } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await find((await params).token);
  if (!found) return {};
  const parts = [found.name, found.run.branch.code, periodToInput(found.run.period)];
  return { title: { absolute: parts.map((p) => p.trim().replace(/[\\/:*?"<>|\s]+/g, "-")).join("_") }, robots: { index: false } };
}

// A dispatcher's own payslip, opened from the link sent to their phone. No sign-in: the signed token is the key.
export default async function PayslipLinkPage({ params, searchParams }: Props) {
  const [{ token }, { lang: langParam }] = await Promise.all([params, searchParams]);
  const found = await find(token);
  if (!found) notFound();
  const lang: SlipLang = SLIP_LANGS.find((l) => l === langParam) ?? "both";
  const [run, company] = await Promise.all([
    getRunView(found.run.agentId, found.run.id),
    prisma.agent.findUnique({ where: { id: found.run.agentId }, select: { name: true, companyRegistrationNo: true, companyAddress: true, stampImageUrl: true } }),
  ]);
  const result = run?.results.find((r) => r.id === found.id);
  if (!run || !result || !company) notFound();
  const langHref = (l: SlipLang) => `/app/p/${token}${l === "both" ? "" : `?lang=${l}`}`;
  return <Payslips slips={[{ run, result }]} company={company} lang={lang} langHref={langHref} />;
}
