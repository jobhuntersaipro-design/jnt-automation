import Link from "next/link";
import { Clock } from "lucide-react";
import { trialDaysLeft, trialEndDate } from "@/lib/billing";

/** Header chip shown while the agent's 30-day free trial is running. */
export function TrialChip({ createdAt }: { createdAt: Date }) {
  const end = trialEndDate(createdAt);
  const daysLeft = trialDaysLeft(createdAt);
  if (daysLeft <= 0) return null;

  const endLabel = end.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  const urgent = daysLeft <= 7;

  return (
    <Link
      href="/settings#plan"
      title={`Free trial ends ${endLabel}`}
      data-testid="trial-chip"
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.72rem] font-medium whitespace-nowrap transition-colors ${
        urgent ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-brand/10 text-brand hover:bg-brand/15"
      }`}
    >
      <Clock size={12} />
      <span className="hidden sm:inline">Free trial · {daysLeft} day{daysLeft === 1 ? "" : "s"} left · ends {endLabel}</span>
      <span className="sm:hidden">{daysLeft}d trial</span>
    </Link>
  );
}
