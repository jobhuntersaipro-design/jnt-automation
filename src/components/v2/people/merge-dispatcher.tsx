"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import { Combobox } from "@/components/arc/combobox/combobox";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import { personOptions } from "@/components/v2/penalties/penalties";
import type { PersonOption } from "@/lib/v2/penalties/data";
import { mergeDispatchers } from "@/lib/v2/people/actions";
import ui from "../ui.module.css";


/**
 * One person under two J&T IDs (moved branch, or got a new ID): join the other record into this one,
 * so vehicle and type, advances, penalties and pay history are one person's.
 */
export function MergeDispatcher({ dispatcher, others, suggested }: { dispatcher: { id: string; name: string }; others: PersonOption[]; suggested: PersonOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [otherId, setOtherId] = useState("");
  const other = others.find((o) => o.id === otherId);

  return (
    <section className={ui.card} aria-labelledby="merge-title">
      <div>
        <h2 id="merge-title" className={ui.cardTitle}>
          {t("merge.title")}
        </h2>
        <p className={ui.help}>{t("merge.help")}</p>
      </div>
      {suggested.length > 0 && (
        <div className={ui.row}>
          <span className={ui.help}>{t("merge.suggested")}</span>
          {suggested.map((s) => (
            <Button key={s.id} variant="ghost" size="sm" onClick={() => setOtherId(s.id)}>
              {`${s.name} (${s.detail})`}
            </Button>
          ))}
        </div>
      )}
      <Combobox
        label={t("merge.other")}
        options={personOptions(others)}
        value={otherId}
        onValueChange={setOtherId}
        placeholder={t("penalties.pick")}
        emptyMessage={t("penalties.noPeople")}
        clearLabel={t("common.clear")}
      />
      {other && (
        <div className={ui.row}>
          <ConfirmButton
            label={t("merge.button")}
            prompt={t("merge.prompt", { other: `${other.name} (${other.detail})`, name: dispatcher.name })}
            confirmLabel={t("merge.button")}
            onConfirm={async () => {
              const r = await mergeDispatchers({ keepId: dispatcher.id, mergeId: other.id });
              if (!r.ok) {
                toast.error(t(r.error, r.vars));
                throw new Error(r.error);
              }
              toast.success(t("merge.done", { other: other.name, name: dispatcher.name }));
              setOtherId("");
              router.refresh();
            }}
          />
        </div>
      )}
    </section>
  );
}
