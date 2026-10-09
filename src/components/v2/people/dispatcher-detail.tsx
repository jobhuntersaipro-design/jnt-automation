"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { useI18n } from "@/components/v2/i18n-provider";
import { KINDS, type Employment, type Kind, type PenaltyType } from "@/lib/v2/pay/config";
import { deleteProfile, setProfiles } from "@/lib/v2/people/actions";
import type { ProfileView } from "@/lib/v2/people/data";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import type { PersonOption } from "@/lib/v2/penalties/data";
import { addAssignment, removeAssignment } from "@/lib/v2/rules/actions";
import { MergeDispatcher } from "./merge-dispatcher";
import { monthLabel, penaltyLabel, PROFILES, profileKey, profileLabel, scopeLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./people.module.css";

export interface ResolvedView {
  kind: Kind;
  /** The type a penalty rule deducts this month; each type has its own rule. */
  penalty: PenaltyType | null;
  ruleId: string;
  ruleName: string;
  self: boolean;
  branchCode: string | null;
  employment: Employment | null;
  effectiveFrom: Period;
  hasRates: boolean;
}

interface Props {
  dispatcher: { id: string; name: string; outlets: { id: string; code: string; extId: string }[] };
  /** Newest first. */
  profiles: ProfileView[];
  period: Period;
  outletId: string;
  hasProfile: boolean;
  resolved: ResolvedView[];
  overrides: { id: string; ruleName: string; kind: Kind; effectiveFrom: Period }[];
  ruleOptions: { id: string; name: string; kind: Kind }[];
  /** Everyone else, for joining a second record of the same person; `suggested` share this name. */
  others: PersonOption[];
  suggested: PersonOption[];
  /** False for a branch supervisor: no merging, no rules of their own. */
  owner: boolean;
}

/** One dispatcher: vehicle and FT/PT over time, which rules pay them in a month, and their own rules. */
export function DispatcherDetail({ dispatcher, profiles, period, outletId, hasProfile, resolved, overrides, ruleOptions, others, suggested, owner }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  // Two J&T IDs at one branch (after a merge) are still one branch to pick.
  const branches = [...new Map(dispatcher.outlets.map((o) => [o.id, o])).values()];
  const go = (p: Period, outlet: string) => router.replace(`/app/dispatchers/${dispatcher.id}?month=${p}&outlet=${outlet}`, { scroll: false });
  // One row per kind; penalties get one per type that has a rule.
  const rows: { kind: Kind; r?: ResolvedView }[] = KINDS.flatMap((kind) => {
    const rs = resolved.filter((x) => x.kind === kind);
    return rs.length > 0 ? rs.map((r) => ({ kind, r })) : [{ kind }];
  });

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href={`/app/dispatchers?month=${period}`} className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("dispatcher.back")}
          </Link>
          <h1 className={ui.title}>{dispatcher.name}</h1>
          <p className={ui.subtitle}>{dispatcher.outlets.map((o) => t("dispatcher.ids", { outlet: o.code, id: o.extId })).join(" · ")}</p>
        </div>
      </header>

      <div className={ui.split}>
        <div className={ui.stack}>
          <section className={ui.card} aria-labelledby="pay-rules-title">
            <div>
              <h2 id="pay-rules-title" className={ui.cardTitle}>
                {t("dispatcher.rulesTitle")}
              </h2>
              <p className={ui.help}>{t("dispatcher.rulesHelp")}</p>
            </div>
            <div className={styles.toolbar}>
              <label className={ui.field}>
                <span className={ui.label}>{t("dispatcher.month")}</span>
                <input
                  type="month"
                  className={ui.input}
                  value={periodToInput(period)}
                  onChange={(e) => {
                    const p = periodFromInput(e.target.value);
                    if (p) go(p, outletId);
                  }}
                />
              </label>
              {branches.length > 1 && (
                <Select label={t("dispatcher.outlet")} value={outletId} onValueChange={(v) => go(period, v)} options={branches.map((o) => ({ value: o.id, label: o.code }))} />
              )}
            </div>
            {!hasProfile && <Alert tone="warning" title={t("dispatcher.noProfile")} />}
            <ul className={ui.list}>
              {rows.map(({ kind, r }) => {
                const who = r && (r.self ? t("dispatcher.self") : scopeLabel(i18n, { branchCode: r.branchCode, dispatcherName: null, employment: r.employment }));
                return (
                  <li key={r ? `${kind}:${r.ruleId}` : kind}>
                    <span className={styles.named}>
                      <span className={ui.help}>{r?.penalty ? `${t(`kind.${kind}`)} · ${penaltyLabel(i18n, r.penalty)}` : t(`kind.${kind}`)}</span>
                      {r ? (
                        <Link href={`/app/rules/${r.ruleId}`} className={ui.link}>
                          {r.ruleName}
                        </Link>
                      ) : (
                        <span className={ui.muted}>{t(kind === "PENALTY" ? "dispatcher.noPenaltyRule" : "dispatcher.noRule")}</span>
                      )}
                    </span>
                    {r && who && (
                      <span className={styles.end}>
                        <span className={ui.help}>{t("dispatcher.via", { who, month: monthLabel(i18n, r.effectiveFrom) })}</span>
                        {!r.hasRates && <span className={styles.warn}>{t("dispatcher.noRates")}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {owner && <Overrides dispatcherId={dispatcher.id} overrides={overrides} ruleOptions={ruleOptions} period={period} />}
          {owner && <MergeDispatcher dispatcher={dispatcher} others={others} suggested={suggested} />}
        </div>
        <Profiles dispatcherId={dispatcher.id} name={dispatcher.name} profiles={profiles} period={period} />
      </div>
    </div>
  );
}

function Overrides({ dispatcherId, overrides, ruleOptions, period }: { dispatcherId: string; overrides: Props["overrides"]; ruleOptions: Props["ruleOptions"]; period: Period }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [ruleId, setRuleId] = useState(ruleOptions[0]?.id ?? "");
  const [month, setMonth] = useState(periodToInput(period));
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function add() {
    const effectiveFrom = periodFromInput(month);
    if (!effectiveFrom || !ruleId) return toast.error(t("error.invalid"));
    setPending(true);
    const r = await addAssignment({ ruleId, branchId: null, dispatcherId, employment: null, effectiveFrom });
    setPending(false);
    if (!r.ok) return toast.error(t(r.error));
    toast.success(t("applies.added"));
    startRefresh(() => router.refresh());
  }

  return (
    <section className={ui.card} aria-labelledby="overrides-title">
      <div>
        <h2 id="overrides-title" className={ui.cardTitle}>
          {t("dispatcher.overridesTitle")}
        </h2>
        <p className={ui.help}>{t("dispatcher.overridesHelp")}</p>
      </div>
      {overrides.length === 0 ? (
        <p className={ui.muted}>{t("dispatcher.overridesNone")}</p>
      ) : (
        <ul className={ui.list}>
          {overrides.map((o) => (
            <li key={o.id}>
              <span className={styles.named}>
                <span className={ui.help}>{t(`kind.${o.kind}`)}</span>
                <span>{o.ruleName}</span>
              </span>
              <span className={styles.end}>
                <span className={ui.help}>{t("rules.fromMonth", { month: monthLabel(i18n, o.effectiveFrom) })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("dispatcher.removeOverride", { rule: o.ruleName })}
                  onClick={async () => {
                    const r = await removeAssignment({ assignmentId: o.id });
                    if (!r.ok) return toast.error(t(r.error));
                    router.refresh();
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ruleOptions.length === 0 ? (
        <p className={ui.muted}>{t("dispatcher.noRules")}</p>
      ) : (
        <div className={styles.toolbar}>
          <Select
            label={t("dispatcher.rule")}
            value={ruleId}
            onValueChange={setRuleId}
            options={ruleOptions.map((r) => ({ value: r.id, label: t("outlets.ruleLine", { kind: t(`kind.${r.kind}`), rule: r.name }) }))}
          />
          <label className={ui.field}>
            <span className={ui.label}>{t("dispatcher.from")}</span>
            <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <Button variant="secondary" onClick={add} loading={pending || refreshing}>
            {t("dispatcher.add")}
          </Button>
        </div>
      )}
    </section>
  );
}

function Profiles({ dispatcherId, name, profiles, period }: { dispatcherId: string; name: string; profiles: ProfileView[]; period: Period }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  // The profile in force this month; nothing picked when there isn't one, so "not set" never looks set.
  const [key, setKey] = useState(() => {
    const current = profiles.find((p) => p.effectiveFrom <= period);
    return current ? profileKey(current) : "";
  });
  const [month, setMonth] = useState(periodToInput(period));
  const [pending, setPending] = useState(false);

  async function save() {
    const effectiveFrom = periodFromInput(month);
    const profile = PROFILES.find((p) => p.key === key);
    if (!effectiveFrom || !profile) return toast.error(t("error.invalid"));
    setPending(true);
    const r = await setProfiles({ dispatcherIds: [dispatcherId], effectiveFrom, vehicle: profile.vehicle, employment: profile.employment });
    setPending(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("dispatchers.saved", { name, month: monthLabel(i18n, effectiveFrom) }));
    router.refresh();
  }

  return (
    <section className={ui.card} aria-labelledby="profile-title">
      <div>
        <h2 id="profile-title" className={ui.cardTitle}>
          {t("dispatcher.profileTitle")}
        </h2>
        <p className={ui.help}>{t("dispatcher.profileHelp")}</p>
      </div>
      {profiles.length === 0 ? (
        <p className={ui.muted}>{t("dispatcher.profileNone")}</p>
      ) : (
        <ul className={ui.list}>
          {profiles.map((p) => (
            <li key={p.id}>
              <span className={styles.named}>
                <span className={ui.help}>{t("dispatcher.profileAt", { month: monthLabel(i18n, p.effectiveFrom) })}</span>
                <span>{profileLabel(i18n, p)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("dispatcher.profileRemove", { month: monthLabel(i18n, p.effectiveFrom) })}
                onClick={async () => {
                  const r = await deleteProfile({ profileId: p.id });
                  if (!r.ok) return toast.error(t(r.error));
                  router.refresh();
                }}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={ui.stack}>
        <Select
          label={t("dispatcher.set")}
          placeholder={t("profile.choose")}
          value={key}
          onValueChange={setKey}
          options={PROFILES.map((p) => ({ value: p.key, label: profileLabel(i18n, p) }))}
        />
        <label className={ui.field}>
          <span className={ui.label}>{t("dispatcher.from")}</span>
          <input type="month" className={ui.input} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <div>
          <Button onClick={save} loading={pending} disabled={!key}>
            {t("dispatcher.save")}
          </Button>
        </div>
      </div>
    </section>
  );
}
