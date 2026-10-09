import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Payslips, SLIP_LANGS, type SlipLang } from "@/components/v2/payslip/payslips";
import { prisma } from "@/lib/prisma";
import { periodToInput } from "@/lib/v2/pay/resolve";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

type Props = { params: Promise<{ runId: string }>; searchParams: Promise<{ d?: string; lang?: string }> };

// The browser names a saved PDF after the page title: <Dispatcher>_<Outlet>_<YYYY-MM>.pdf, or the outlet's for all of a run.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const s = await v2Session();
  if (!s) return {};
  const [{ runId }, { d }] = await Promise.all([params, searchParams]);
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, agentId: s.agentId }, select: { period: true, branch: { select: { code: true } } } });
  if (!run) return {};
  const one = d ? await prisma.payrollResult.findFirst({ where: { id: d, runId }, select: { name: true } }) : null;
  const parts = [one?.name ?? "Payslips", run.branch.code, periodToInput(run.period)];
  return { title: { absolute: parts.map((p) => p.trim().replace(/[\\/:*?"<>|\s]+/g, "-")).join("_") } };
}

// Outside the app shell so the page prints as payslips only. `?d=` is one dispatcher's result; `?lang=` narrows the labels.
export default async function PayslipsPage({ params, searchParams }: Props) {
  const s = await v2Session();
  if (!s) notFound();
  const [{ runId }, { d, lang: langParam }] = await Promise.all([params, searchParams]);
  const lang: SlipLang = SLIP_LANGS.find((l) => l === langParam) ?? "both";
  const [run, company] = await Promise.all([
    getRunView(s.agentId, runId),
    prisma.agent.findUnique({ where: { id: s.agentId }, select: { name: true, companyRegistrationNo: true, companyAddress: true, stampImageUrl: true } }),
  ]);
  if (!run || !company) notFound();
  const results = d ? run.results.filter((r) => r.id === d) : run.results;
  if (results.length === 0) notFound();
  const langHref = (l: SlipLang) => `/app/payslips/${run.id}?${new URLSearchParams({ ...(d ? { d } : {}), ...(l === "both" ? {} : { lang: l }) })}`;
  return <Payslips slips={results.map((result) => ({ run, result }))} company={company} back={`/app/payroll/${run.id}`} lang={lang} langHref={langHref} />;
}
