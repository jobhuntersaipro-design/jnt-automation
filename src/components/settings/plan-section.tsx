"use client";

import { useEffect, useState } from "react";
import { CreditCard, Download, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  PRICE_PER_BRANCH,
  SELF_SERVE_MAX_BRANCHES,
  billableMonths,
  billingStatus,
  firstBillableMonth,
  monthKey,
  planLimitError,
  type YearMonth,
} from "@/lib/billing";
import { ConfirmDialog, type ConfirmRequest } from "@/components/admin/confirm-dialog";
import { formatDate, formatMonth, formatRM, trialInfo } from "@/components/admin/admin-shared";

export interface PlanInvoice extends YearMonth {
  branchCount: number;
  amount: number;
  paidAt: string | null;
}

const MONTHS_SHOWN = 12;

export function PlanSection({
  initialMaxBranches,
  branchesInUse,
  createdAt,
  isSuperAdmin,
  payOnline,
  invoices,
}: {
  initialMaxBranches: number;
  branchesInUse: number;
  createdAt: string;
  isSuperAdmin: boolean;
  /** Billplz is configured, so due months get a Pay now button. */
  payOnline: boolean;
  invoices: PlanInvoice[];
}) {
  const [maxBranches, setMaxBranches] = useState(initialMaxBranches);
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
  const [draft, setDraft] = useState(initialMaxBranches);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const min = Math.max(1, branchesInUse);
  const trial = trialInfo(createdAt);
  const firstBill = firstBillableMonth(createdAt);
  const now = new Date();
  const thisMonth = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const nextInvoice = monthKey(firstBill) > monthKey(thisMonth) ? firstBill : thisMonth;
  const months = billableMonths(createdAt).slice(0, MONTHS_SHOWN);
  const changed = draft !== maxBranches;
  const draftError = planLimitError(draft, branchesInUse);

  function requestSave() {
    if (draftError) return toast.error(draftError);
    const increase = draft > maxBranches;
    setConfirm({
      title: increase ? `Increase to ${draft} branches?` : `Reduce to ${draft} branch${draft === 1 ? "" : "es"}?`,
      body: (
        <>
          {increase ? "You can add more branches straight away. " : ""}
          {isSuperAdmin ? (
            "Admin accounts aren't billed."
          ) : (
            <>
              Your plan becomes <strong className="text-on-surface">{formatRM(draft * PRICE_PER_BRANCH)}/month</strong>{" "}
              ({draft} × RM {PRICE_PER_BRANCH}), starting with your {formatMonth(nextInvoice)} invoice
              {trial.active ? ", after your free trial" : ""}.
            </>
          )}
        </>
      ),
      confirmLabel: increase ? "Increase limit" : "Reduce limit",
      onConfirm: async () => {
        const res = await fetch("/api/settings/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxBranches: draft }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Couldn't update your plan");
          return false;
        }
        setMaxBranches(data.maxBranches);
        setDraft(data.maxBranches);
        toast.success(`Branch limit is now ${data.maxBranches}`);
      },
    });
  }

  return (
    <section id="plan">
      <h2 className="font-manrope font-semibold text-lg text-on-surface mb-1">Plan &amp; billing</h2>
      <p className="text-xs text-on-surface-variant mb-4">
        RM {PRICE_PER_BRANCH} per branch per month. Change your branch limit any time.
      </p>
      <div className="bg-surface-card rounded-lg p-6 flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Branch limit</span>
            <div className="flex items-center gap-2">
              <StepButton label="Fewer branches" disabled={draft <= min} onClick={() => setDraft((d) => d - 1)}>
                <Minus size={14} />
              </StepButton>
              <input
                type="number"
                inputMode="numeric"
                min={min}
                max={SELF_SERVE_MAX_BRANCHES}
                value={draft}
                onChange={(e) => setDraft(Math.trunc(Number(e.target.value)) || 0)}
                aria-label="Branch limit"
                className="w-16 border border-outline-variant rounded-md px-2 py-1.5 text-base sm:text-sm text-center tabular-nums text-on-surface bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <StepButton label="More branches" disabled={draft >= SELF_SERVE_MAX_BRANCHES} onClick={() => setDraft((d) => d + 1)}>
                <Plus size={14} />
              </StepButton>
            </div>
          </div>
          <Stat label="In use" value={`${branchesInUse} of ${maxBranches}`} />
          <Stat
            label={changed ? "New monthly price" : "Monthly price"}
            value={isSuperAdmin ? "Not billed" : formatRM(draft * PRICE_PER_BRANCH)}
            sub={changed && !isSuperAdmin ? `was ${formatRM(maxBranches * PRICE_PER_BRANCH)}` : undefined}
          />
        </div>

        {changed && draftError && <p className="text-xs text-critical -mt-2">{draftError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-on-surface-variant">
            {isSuperAdmin
              ? "Admin account — not billed."
              : trial.active
                ? `Free trial until ${formatDate(trial.end)} (${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left). First invoice: ${formatMonth(firstBill)}.`
                : `Billed monthly. Next invoice: ${formatMonth(nextInvoice)}.`}
          </p>
          {changed && (
            <div className="flex gap-2">
              <button
                onClick={() => setDraft(maxBranches)}
                className="text-sm text-on-surface-variant hover:text-on-surface px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={requestSave}
                disabled={Boolean(draftError)}
                className="bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                Update plan
              </button>
            </div>
          )}
        </div>

        {!isSuperAdmin && months.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Invoices</span>
            {months.map((ym) => {
              const inv = invoices.find((i) => i.year === ym.year && i.month === ym.month);
              const status = billingStatus({ createdAt, isSuperAdmin }, invoices, ym);
              if (status !== "paid" && status !== "unpaid") return null;
              // Same rule as the invoice PDF: paid months keep their snapshot, open months bill the current limit.
              const limit = inv?.paidAt ? inv.branchCount : maxBranches;
              const amount = inv?.paidAt ? inv.amount : limit * PRICE_PER_BRANCH;
              return (
                <div key={`${ym.year}-${ym.month}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1.5">
                  <span className="w-20 text-sm text-on-surface">{formatMonth(ym)}</span>
                  <span className="w-32 flex flex-col">
                    <span className="text-sm tabular-nums text-on-surface">{formatRM(amount)}</span>
                    <span className="text-xs tabular-nums text-on-surface-variant whitespace-nowrap">
                      {limit} branch{limit === 1 ? "" : "es"} × RM {PRICE_PER_BRANCH}
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
                        Pay now
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
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-on-surface leading-8">{value}</span>
      {sub && <span className="text-xs text-on-surface-variant/70 -mt-1.5">{sub}</span>}
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center border border-outline-variant rounded-md text-on-surface hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
