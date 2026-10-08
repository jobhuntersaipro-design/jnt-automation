"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { SearchField } from "@/components/arc/search-field/search-field";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { useI18n } from "@/components/v2/i18n-provider";
import { setProfiles } from "@/lib/v2/people/actions";
import type { DispatcherRow } from "@/lib/v2/people/data";
import { periodFromInput, periodToInput, type Period } from "@/lib/v2/pay/resolve";
import { monthLabel, PROFILES, profileKey, profileLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./people.module.css";

/** Every dispatcher with their vehicle and FT/PT in one month; set them one by one or in bulk. */
export function DispatcherList({ rows, period }: { rows: DispatcherRow[]; period: Period }) {
  const i18n = useI18n();
  const { t } = i18n;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "unset">("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulk, setBulk] = useState(PROFILES[0].key);
  const [bulkPending, setBulkPending] = useState(false);
  // What the user just picked, shown until the server's copy catches up.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const month = monthLabel(i18n, period);

  const valueOf = (r: DispatcherRow) => picked[r.id] ?? (r.profile ? profileKey(r.profile) : "");
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => (show === "all" || !valueOf(r)) && (!q || [r.name, r.extId, ...r.outlets].some((s) => s.toLowerCase().includes(q))));
  const unset = rows.filter((r) => !valueOf(r)).length;
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  async function save(ids: string[], key: string) {
    const profile = PROFILES.find((p) => p.key === key);
    if (!profile) return false;
    setPicked((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, key])) }));
    const r = await setProfiles({ dispatcherIds: ids, effectiveFrom: period, vehicle: profile.vehicle, employment: profile.employment });
    if (!r.ok) {
      setPicked((s) => Object.fromEntries(Object.entries(s).filter(([id]) => !ids.includes(id))));
      toast.error(t(r.error, r.vars));
      return false;
    }
    const name = rows.find((x) => x.id === ids[0])?.name ?? "";
    toast.success(ids.length === 1 ? t("dispatchers.saved", { name, month }) : i18n.tp("dispatchers.savedMany", ids.length, { month }));
    return true;
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  }

  if (rows.length === 0) {
    return (
      <div className={ui.page}>
        <Header />
        <EmptyState title={t("dispatchers.emptyTitle")} description={t("dispatchers.emptyBody")} />
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <Header />
      <div className={styles.toolbar}>
        <label className={ui.field}>
          <span className={ui.label}>{t("dispatchers.month")}</span>
          <input
            type="month"
            className={ui.input}
            value={periodToInput(period)}
            onChange={(e) => {
              const p = periodFromInput(e.target.value);
              if (p) router.replace(`/app/dispatchers?month=${p}`, { scroll: false });
            }}
          />
        </label>
        <div className={styles.search}>
          <SearchField label={t("dispatchers.search")} value={query} onValueChange={setQuery} clearLabel={t("common.clearSearch")} />
        </div>
        <div className={ui.field}>
          <span className={ui.label}>{t("dispatchers.show")}</span>
          <SegmentedControl
            label={t("dispatchers.show")}
            value={show}
            onValueChange={(v) => setShow(v === "unset" ? "unset" : "all")}
            options={[
              { value: "all", label: t("dispatchers.all") },
              { value: "unset", label: t("dispatchers.unset") },
            ]}
          />
        </div>
      </div>

      {unset > 0 && <Alert tone="warning" title={i18n.tp("dispatchers.unsetCount", unset, { month })} />}

      {selected.size > 0 && (
        <div className={styles.bulkBar} role="region" aria-label={t("dispatchers.setSelected")}>
          <span className={styles.bulkCount}>{i18n.tp("dispatchers.selected", selected.size)}</span>
          <select className={ui.input} aria-label={t("dispatchers.setSelected")} value={bulk} onChange={(e) => setBulk(e.target.value)}>
            {PROFILES.map((p) => (
              <option key={p.key} value={p.key}>
                {profileLabel(i18n, p)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            loading={bulkPending}
            onClick={async () => {
              setBulkPending(true);
              if (await save([...selected], bulk)) setSelected(new Set());
              setBulkPending(false);
            }}
          >
            {t("dispatchers.apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("common.clear")}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className={ui.muted}>{t("dispatchers.noMatch")}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.check}>
                  <input
                    type="checkbox"
                    aria-label={t("dispatchers.selectAll")}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))}
                  />
                </th>
                <th scope="col">{t("dispatchers.name")}</th>
                <th scope="col">{t("dispatchers.profile")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className={styles.check}>
                    <input type="checkbox" aria-label={t("dispatchers.select", { name: r.name })} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>
                    <span className={styles.named}>
                      <Link href={`/app/dispatchers/${r.id}?month=${period}`} className={styles.name}>
                        {r.name}
                      </Link>
                      <span className={ui.help}>{[...r.outlets, r.extId].join(" · ")}</span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.named}>
                      <select
                        className={`${ui.input} ${styles.profileSelect}`}
                        aria-label={t("dispatchers.profileFor", { name: r.name })}
                        value={valueOf(r)}
                        onChange={(e) => void save([r.id], e.target.value)}
                      >
                        {!valueOf(r) && (
                          <option value="" disabled>
                            {t("profile.notSet")}
                          </option>
                        )}
                        {PROFILES.map((p) => (
                          <option key={p.key} value={p.key}>
                            {profileLabel(i18n, p)}
                          </option>
                        ))}
                      </select>
                      {r.next && <span className={ui.help}>{t("dispatchers.changesFrom", { month: monthLabel(i18n, r.next.effectiveFrom) })}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <header className={ui.pageHeader}>
      <div>
        <h1 className={ui.title}>{t("dispatchers.title")}</h1>
        <p className={ui.subtitle}>{t("dispatchers.subtitle")}</p>
      </div>
    </header>
  );
}
