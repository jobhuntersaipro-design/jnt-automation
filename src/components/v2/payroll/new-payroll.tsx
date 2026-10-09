"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Stepper } from "@/components/arc/stepper/stepper";
import { useI18n } from "@/components/v2/i18n-provider";
import { PenaltyImport } from "@/components/v2/penalties/penalty-import";
import { confirmPenalties } from "@/lib/v2/payroll/actions";
import type { Period } from "@/lib/v2/pay/resolve";
import { monthLabel } from "../labels";
import { RunUpload } from "./runs";
import ui from "../ui.module.css";

export interface WizardRun {
  id: string;
  outlet: string;
  period: Period;
  /** The branch's penalty cases already imported for the run's month, and how many still need a dispatcher. */
  cases: number;
  unmatched: number;
}

export function NewPayroll({ run, hasCard }: { run: WizardRun | null; hasCard: boolean }) {
  const { t } = useI18n();
  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <Link href="/app/payroll" className={ui.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("run.back")}
          </Link>
          <h1 className={ui.title}>{t("wizard.title")}</h1>
          <p className={ui.subtitle}>{t("wizard.subtitle")}</p>
        </div>
      </header>
      <Stepper
        label={t("wizard.title")}
        current={run ? 1 : 0}
        steps={[
          { id: "file", label: t("wizard.step.file") },
          { id: "penalties", label: t("wizard.step.penalties") },
          { id: "review", label: t("wizard.step.review") },
        ]}
      />
      {!run && !hasCard && (
        <Alert tone="warning" title={t("wizard.noCard")}>
          <Link href="/app/rules" className={ui.link}>
            {t("run.cover.create")}
          </Link>
        </Alert>
      )}
      {run ? <PenaltiesStep run={run} /> : <RunUpload />}
    </div>
  );
}

function PenaltiesStep({ run }: { run: WizardRun }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const month = monthLabel(i18n, run.period);

  async function next() {
    setBusy(true);
    const r = await confirmPenalties({ runId: run.id });
    if (!r.ok) {
      setBusy(false);
      return toast.error(t(r.error, r.vars));
    }
    router.push(`/app/payroll/${run.id}`);
  }

  return (
    <>
      <section className={ui.card} aria-labelledby="penalties-step">
        <div>
          <h2 id="penalties-step" className={ui.cardTitle}>
            {t("wizard.penalties.title", { outlet: run.outlet, month })}
          </h2>
          <p className={ui.help}>{t("wizard.penalties.help")}</p>
        </div>
        <p role="status">{run.cases > 0 ? tp("wizard.penalties.imported", run.cases, { month }) : t("wizard.penalties.none", { month })}</p>
        {run.unmatched > 0 && (
          <Alert tone="warning" title={tp("wizard.penalties.unmatched", run.unmatched)}>
            <Link href={`/app/penalties?month=${run.period}`} className={ui.link}>
              {t("wizard.penalties.match")}
            </Link>
          </Alert>
        )}
        <div className={ui.row}>
          <Button onClick={next} loading={busy} disabled={run.cases === 0}>
            {t("wizard.penalties.continue")}
          </Button>
        </div>
      </section>
      <PenaltyImport defaultPeriod={run.period} stay />
    </>
  );
}
