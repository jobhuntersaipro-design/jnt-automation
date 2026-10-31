"use client";

import { useEffect, useState } from "react";
import { CreditCard, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  billableMonths,
  billingStatus,
  firstBillableMonth,
  isOverdue,
  monthKey,
  planPricing,
  type YearMonth,
} from "@/lib/billing";
import { formatDate, formatMonth, formatRM, trialInfo } from "@/components/admin/admin-shared";

export interface PlanInvoice extends YearMonth {
  branchCount: number;
  amount: number;
  paidAt: string | null;
}

const MONTHS_SHOWN = 12;

export function PlanSection({
  maxBranches,
  monthlyPrice,
  branchesInUse,
  createdAt,
  isSuperAdmin,
  payOnline,
  invoices,
}: {
  maxBranches: number;
  /** Fixed RM a month set by the superadmin; null = branch limit × RM 150. */
  monthlyPrice: number | null;
  branchesInUse: number;
  createdAt: string;
  isSuperAdmin: boolean;
  /** Billplz (FPX) is configured and on for this account, so due months get a Pay now button. */
  payOnline: boolean;
  invoices: PlanInvoice[];
}) {
  const [paying, setPaying] = useState<string | null>(null);

  // Billplz redirects back here with billplz[paid]; the callback does the actual marking.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("billplz[paid]");
    if (paid === null) return;
    if (paid === "true") toast.success("Payment received — thank you. Your receipt is on its way by email.");
    else toast.error("Payment wasn't completed. You can try again any time.");
    window.history.replaceState(null, "", "/settings#plan");
    document.getElementById("plan")?.scrollIntoView();
  }, []);

  async function pay(ym: YearMonth) {
    setPaying(`${ym.year}-${ym.month}`);
    const res = await fetch(`/api/settings/invoices/${ym.year}/${ym.month}/pay`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.assign(data.url);
      return;
    }
    toast.error(data.error || "Couldn't start the payment");
    setPaying(null);
  }

  const plan = planPricing({ maxBranches, monthlyPrice });
  const trial = trialInfo(createdAt);
  const firstBill = firstBillableMonth(createdAt);
  const now = new Date();
  const thisMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const nextInvoice = monthKey(firstBill) > monthKey(thisMonth) ? firstBill : thisMonth;
  const months = billableMonths(createdAt).slice(0, MONTHS_SHOWN);
  const overdue = isOverdue({ createdAt, isSuperAdmin, onlinePayment: payOnline }, invoices);

  return (
    <section id="plan">
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-1">Plan &amp; billing</h2>
      <p className="text-xs text-on-surface-variant mb-4">
        An invoice is issued on the 1st of each month and is due the next day.
      </p>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-6">
        {overdue && (
          <p className="text-sm text-critical bg-red-50 rounded-md px-3 py-2">
            Your account is overdue. Pay the due invoice below to continue making changes.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Stat label="Monthly price" value={isSuperAdmin ? "Not billed" : formatRM(plan.amount)} />
          <Stat label="Branches in use" value={String(branchesInUse)} />
        </div>

        <p className="text-xs text-on-surface-variant">
          {isSuperAdmin
            ? "Admin account — not billed."
            : trial.active
              ? `Free trial until ${formatDate(trial.end)} (${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left). First invoice: ${formatMonth(firstBill)}.`
              : `Billed monthly. Next invoice: ${formatMonth(nextInvoice)}.`}
        </p>

        {!isSuperAdmin && months.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Invoices</span>
            {months.map((ym) => {
              const inv = invoices.find((i) => i.year === ym.year && i.month === ym.month);
              const status = billingStatus({ createdAt, isSuperAdmin }, invoices, ym);
              if (status !== "paid" && status !== "unpaid") return null;
              // Same rule as the invoice PDF: paid months keep their snapshot, open months bill today's plan.
              const amount = inv?.paidAt ? inv.amount : plan.amount;
              const count = inv?.paidAt ? inv.branchCount : plan.branchCount;
              return (
                <div key={`${ym.year}-${ym.month}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1.5">
                  <span className="w-20 text-sm text-on-surface">{formatMonth(ym)}</span>
                  <span className="w-32 flex flex-col">
                    <span className="text-sm tabular-nums text-on-surface">{formatRM(amount)}</span>
                    <span className="text-xs tabular-nums text-on-surface-variant whitespace-nowrap">
                      {count === 1 ? "Monthly plan" : `${count} branches × RM 150`}
                    </span>
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[0.7rem] font-semibold rounded ${
                      status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {status === "paid" ? "Paid" : "Due"}
                  </span>
                  <div className="ml-auto flex items-center gap-3">
                    {status === "unpaid" && payOnline && (
                      <button
                        onClick={() => pay(ym)}
                        disabled={paying !== null}
                        className="inline-flex items-center gap-1.5 bg-primary text-white rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                      >
                        {paying === `${ym.year}-${ym.month}` ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                        Pay now (FPX)
                      </button>
                    )}
                    <a
                      href={`/api/settings/invoices/${ym.year}/${ym.month}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download size={12} /> PDF
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-on-surface leading-8">{value}</span>
    </div>
  );
}
