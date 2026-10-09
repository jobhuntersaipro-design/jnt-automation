import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Payslips, SLIP_LANGS, type SlipLang } from "@/components/v2/payslip/payslips";
import { prisma } from "@/lib/prisma";
import { periodFromParam, periodToInput } from "@/lib/v2/pay/resolve";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

type Props = { params: Promise<{ period: string }>; searchParams: Promise<{ outlet?: string; lang?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ period }, { outlet }] = await Promise.all([params, searchParams]);
  const p = periodFromParam(period);
  return p ? { title: { absolute: ["Payslips", outlet ?? "All-branches", periodToInput(p)].join("_") } } : {};
}

// Every finalised branch of a month in one print view, branch by branch (or one branch with `?outlet=`).
export default async function MonthPayslipsPage({ params, searchParams }: Props) {
  const s = await v2Session();
  if (!s) notFound();
  const [{ period: raw }, { outlet, lang: langParam }] = await Promise.all([params, searchParams]);
  const period = periodFromParam(raw);
  if (!period) notFound();
  const lang: SlipLang = SLIP_LANGS.find((l) => l === langParam) ?? "both";
  const [runs, company] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { agentId: s.agentId, period, status: "FINAL", ...(outlet && { branch: { code: outlet } }), ...(s.member && { branchId: { in: s.member.branchIds } }) },
      select: { id: true },
      orderBy: { branch: { code: "asc" } },
    }),
    prisma.agent.findUnique({ where: { id: s.agentId }, select: { name: true, companyRegistrationNo: true, companyAddress: true, stampImageUrl: true } }),
  ]);
  if (!company) notFound();
  const views = (await Promise.all(runs.map((r) => getRunView(s.agentId, r.id)))).filter((v) => v !== null);
  const slips = views.flatMap((run) => run.results.map((result) => ({ run, result })));
  if (slips.length === 0) notFound();
  const langHref = (l: SlipLang) => `/app/payslips/month/${period}?${new URLSearchParams({ ...(outlet ? { outlet } : {}), ...(l === "both" ? {} : { lang: l }) })}`;
  return <Payslips slips={slips} company={company} back="/app/payroll" lang={lang} langHref={langHref} />;
}
