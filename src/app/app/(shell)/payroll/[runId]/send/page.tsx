import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SendPayslips } from "@/components/v2/payroll/send-payslips";
import { createI18n } from "@/lib/i18n/core";
import { messagesFor } from "@/lib/i18n/messages";
import { prisma } from "@/lib/prisma";
import { periodMonth, periodYear } from "@/lib/v2/pay/resolve";
import { payslipToken } from "@/lib/v2/payslip/link";
import { getRunView } from "@/lib/v2/payroll/data";
import { v2Session } from "@/lib/v2/session";

const zh = createI18n("zh", messagesFor("zh"));
const en = createI18n("en", messagesFor("en"));

/** Each dispatcher's payslip link and a WhatsApp message to send it, for a finalised run. */
export default async function SendPage({ params }: { params: Promise<{ runId: string }> }) {
  const s = await v2Session();
  if (!s) notFound();
  const run = await getRunView(s.agentId, (await params).runId, s.member?.branchIds);
  if (!run) notFound();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const [agent, people] = await Promise.all([
    prisma.agent.findUnique({ where: { id: s.agentId }, select: { name: true } }),
    prisma.dispatcher.findMany({ where: { agentId: s.agentId, id: { in: run.results.map((r) => r.dispatcherId) } }, select: { id: true, phone: true } }),
  ]);
  const phones = new Map(people.map((p) => [p.id, p.phone]));
  const company = agent?.name ?? "";
  // The message is in both languages, like the payslip; the link goes last so WhatsApp previews it.
  const message = (net: number, link: string) =>
    [
      zh.t("send.message", { company, month: zh.month(periodYear(run.period), periodMonth(run.period)), net: zh.money(net) }),
      en.t("send.message", { company, month: en.month(periodYear(run.period), periodMonth(run.period)), net: en.money(net) }),
      link,
    ].join("\n");
  const rows = run.results.map((r) => {
    const link = `${origin}/app/p/${payslipToken(r.id)}`;
    return { id: r.id, dispatcherId: r.dispatcherId, name: r.name, extId: r.extId, netCents: r.netCents, phone: phones.get(r.dispatcherId) ?? null, link, message: message(r.netCents / 100, link) };
  });
  return <SendPayslips run={{ id: run.id, outlet: run.outlet, period: run.period, final: run.status === "FINAL" }} rows={rows} />;
}
