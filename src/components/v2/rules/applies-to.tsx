"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { useI18n } from "@/components/v2/i18n-provider";
import type { Employment } from "@/lib/v2/pay/config";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import { addAssignment, removeAssignment } from "@/lib/v2/rules/actions";
import type { RuleView } from "@/lib/v2/rules/data";
import { monthLabel, scopeLabel } from "../labels";
import ui from "../ui.module.css";

const WHO = ["everyone", "ft", "pt", "outlet", "outlet_ft", "outlet_pt", "dispatcher"] as const;
type Who = (typeof WHO)[number];

export function AppliesTo({
  rule,
  outlets,
  dispatchers,
  thisMonth,
}: {
  rule: RuleView;
  outlets: { id: string; code: string }[];
  dispatchers: { id: string; name: string; extId: string }[];
  thisMonth: Period;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [who, setWho] = useState<Who>("everyone");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [dispatcherId, setDispatcherId] = useState(dispatchers[0]?.id ?? "");
  const [month, setMonth] = useState(periodToInput(thisMonth));
  const [pending, setPending] = useState(false);
  // Keeps the button busy until the refreshed list is on screen, not just until the save returns.
  const [refreshing, startRefresh] = useTransition();

  const needsOutlet = who.startsWith("outlet");
  const employment: Employment | null = who.endsWith("ft") ? "FULL_TIME" : who.endsWith("pt") ? "PART_TIME" : null;
  const available = WHO.filter((w) => (w.startsWith("outlet") ? outlets.length > 0 : w === "dispatcher" ? dispatchers.length > 0 : true));

  async function add() {
    const effectiveFrom = periodFromInput(month);
    if (!effectiveFrom) return toast.error(t("error.invalid"));
    setPending(true);
    const result = await addAssignment({
      ruleId: rule.id,
      branchId: needsOutlet ? outletId : null,
      dispatcherId: who === "dispatcher" ? dispatcherId : null,
      employment,
      effectiveFrom,
    });
    setPending(false);
    if (!result.ok) return toast.error(t(result.error));
    toast.success(t("applies.added"));
    startRefresh(() => router.refresh());
  }

  async function remove(assignmentId: string) {
    const result = await removeAssignment({ assignmentId });
    if (!result.ok) return toast.error(t(result.error));
    router.refresh();
  }

  return (
    <section className={ui.card} aria-labelledby="applies-title">
      <div>
        <h2 id="applies-title" className={ui.cardTitle}>
          {t("applies.title")}
        </h2>
        <p className={ui.help}>{t("applies.help")}</p>
      </div>
      {rule.assignments.length === 0 ? (
        <p className={ui.muted}>{t("applies.none")}</p>
      ) : (
        <ul className={ui.list}>
          {rule.assignments.map((a) => (
            <li key={a.id}>
              <span>
                {scopeLabel(i18n, a)}
                <span className={ui.help}>{` · ${t("rules.fromMonth", { month: monthLabel(i18n, a.effectiveFrom) })}`}</span>
              </span>
              <Button variant="ghost" size="sm" aria-label={t("applies.remove", { who: scopeLabel(i18n, a) })} onClick={() => remove(a.id)}>
                <X size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={ui.stack}>
        <Select label={t("applies.who")} value={who} onValueChange={(v) => setWho(v as Who)} options={available.map((w) => ({ value: w, label: t(`applies.${w}`) }))} />
        {needsOutlet && (
          <Select label={t("applies.whichOutlet")} value={outletId} onValueChange={setOutletId} options={outlets.map((o) => ({ value: o.id, label: o.code }))} />
        )}
        {who === "dispatcher" && (
          <Select
            label={t("applies.whichDispatcher")}
            value={dispatcherId}
            onValueChange={setDispatcherId}
            options={dispatchers.map((d) => ({ value: d.id, label: `${d.name} · ${d.extId}` }))}
          />
        )}
        <label className={ui.field}>
          <span className={ui.label}>{t("applies.from")}</span>
          <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <div>
          <Button variant="secondary" onClick={add} loading={pending || refreshing}>
            {t("applies.add")}
          </Button>
        </div>
      </div>
    </section>
  );
}
