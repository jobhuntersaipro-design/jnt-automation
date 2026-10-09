"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { useI18n } from "@/components/v2/i18n-provider";
import { createOutlet } from "@/lib/v2/people/actions";
import type { OutletView } from "@/lib/v2/people/data";
import { employmentLabel, monthLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./people.module.css";

export function Outlets({ outlets, everyoneHasRules }: { outlets: OutletView[]; everyoneHasRules: boolean }) {
  const i18n = useI18n();
  const { t } = i18n;

  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("outlets.title")}</h1>
          <p className={ui.subtitle}>{t("outlets.subtitle")}</p>
        </div>
        {outlets.length > 0 && <AddOutlet />}
      </header>

      {outlets.length === 0 ? (
        <EmptyState title={t("outlets.emptyTitle")} description={t("outlets.emptyBody")} action={<AddOutlet />} />
      ) : (
        <div className={ui.grid}>
          {outlets.map((o) => (
            <section key={o.id} className={ui.card} aria-labelledby={`outlet-${o.id}`}>
              <div>
                <h2 id={`outlet-${o.id}`} className={ui.cardTitle}>
                  {o.code}
                </h2>
                <p className={ui.help}>{i18n.tp("outlets.dispatchers", o.dispatchers)}</p>
              </div>
              <div className={ui.stack}>
                <h3 className={ui.sectionTitle}>{t("outlets.rules")}</h3>
                {o.rules.length === 0 && everyoneHasRules ? (
                  <p className={ui.muted}>{t("outlets.everyone")}</p>
                ) : o.rules.length === 0 ? (
                  <p className={ui.muted}>
                    {t("outlets.noRules")}{" "}
                    <Link href="/app/rules" className={ui.link}>
                      {t("outlets.setUpRules")}
                    </Link>
                  </p>
                ) : (
                  <ul className={ui.list}>
                    {o.rules.map((r) => (
                      <li key={`${r.ruleId}:${r.employment}:${r.effectiveFrom}`}>
                        <span className={styles.named}>
                          <span className={ui.help}>{t(`kind.${r.kind}`)}</span>
                          <Link href={`/app/rules/${r.ruleId}`} className={ui.link}>
                            {r.ruleName}
                          </Link>
                        </span>
                        <span className={ui.help}>
                          {[r.employment && employmentLabel(i18n, r.employment), t("rules.fromMonth", { month: monthLabel(i18n, r.effectiveFrom) })]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AddOutlet() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button>{t("outlets.add")}</Button>
      </DialogTrigger>
      <DialogContent title={t("outlets.add")} closeLabel={t("common.close")}>
        <form
          className={ui.stack}
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const r = await createOutlet({ code });
            setPending(false);
            if (!r.ok) return setError(t(r.error, r.vars));
            toast.success(t("outlets.added", { code: r.data.code }));
            setOpen(false);
            setCode("");
            router.refresh();
          }}
        >
          <Input
            label={t("outlets.code")}
            description={t("outlets.codeHelp")}
            error={error || undefined}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
          <div>
            <Button type="submit" loading={pending}>
              {t("outlets.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
