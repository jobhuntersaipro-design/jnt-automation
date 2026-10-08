"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { DecimalInput } from "@/components/v2/decimal-input";
import { useI18n } from "@/components/v2/i18n-provider";
import { configProblems, penaltyTypeOf, VEHICLES, type RuleConfig, type Vehicle } from "@/lib/v2/pay/config";
import { computeRule, UNIT_LETTER } from "@/lib/v2/pay/engine";
import { rangeLabels, unitLabel, vehicleLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./rules.module.css";

const MAX_PARCELS = 100_000;

/** Runs the real engine on sample parcels, in the order entered, so marginal tiers show their effect. */
export function Simulator({ config }: { config: RuleConfig }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [vehicle, setVehicle] = useState<Vehicle>("BIKE");
  const [rows, setRows] = useState([{ weight: 1, count: 1500 }]);
  // Penalty rules count a month's cases, which weigh nothing: one count, no weights.
  const penalty = penaltyTypeOf(config.unit) !== null;
  const [cases, setCases] = useState(3);

  const result = useMemo(() => {
    if (configProblems(config).length > 0) return null;
    const w: number[] = penalty ? Array.from({ length: Math.min(cases, MAX_PARCELS) }, () => 0) : [];
    if (!penalty) for (const row of rows) for (let i = 0; i < row.count && w.length < MAX_PARCELS; i++) w.push(row.weight);
    return computeRule(config, { w, c: UNIT_LETTER[config.unit].repeat(w.length) }, vehicle);
  }, [config, rows, vehicle, penalty, cases]);

  const tiers = rangeLabels(i18n, config.tiers, "count");
  const bands = rangeLabels(i18n, config.bands, "kg");
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className={ui.card} aria-labelledby="sim-title">
      <div>
        <h2 id="sim-title" className={ui.cardTitle}>
          {t("sim.title")}
        </h2>
        <p className={ui.help}>{penalty ? t("sim.helpPenalty") : t("sim.help", { unit: unitLabel(i18n, config.unit) })}</p>
      </div>
      {config.byVehicle && (
        <Select
          label={t("sim.vehicle")}
          value={vehicle}
          onValueChange={(v) => setVehicle(v as Vehicle)}
          options={VEHICLES.map((v) => ({ value: v, label: vehicleLabel(i18n, v) }))}
        />
      )}
      {penalty && (
        <label className={ui.field}>
          <span className={ui.label}>{t("sim.cases")}</span>
          <DecimalInput className={styles.fill} label={t("sim.cases")} value={cases} onValueChange={(n) => setCases(Math.max(0, Math.floor(n)))} />
        </label>
      )}
      {!penalty && rows.map((row, i) => (
        <div key={i} className={styles.simRow}>
          <label className={ui.field}>
            <span className={ui.label}>{t("sim.weight")}</span>
            <DecimalInput className={styles.fill} label={t("sim.weight")} value={row.weight} onValueChange={(weight) => update(i, { weight })} />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>{t("sim.count")}</span>
            <DecimalInput className={styles.fill} label={t("sim.count")} value={row.count} onValueChange={(count) => update(i, { count: Math.floor(count) })} />
          </label>
          <Button variant="ghost" size="sm" aria-label={t("common.delete")} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      ))}
      {!penalty && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, { weight: 6, count: 200 }])}>
            <Plus size={16} aria-hidden="true" />
            {t("sim.addRow")}
          </Button>
        </div>
      )}
      {result ? (
        <>
          <p className={styles.total} aria-live="polite">
            {i18n.money(result.cents / 100)}
          </p>
          <ul className={ui.list}>
            {result.groups.map((g) => (
              <li key={`${g.tier}-${g.band}`}>
                <span>
                  {[config.tiers.length > 1 && tiers[g.tier], config.bands.length > 1 && bands[g.band]].filter(Boolean).join(" · ") || t(penalty ? "sim.allCases" : "sim.allParcels")}
                </span>
                <span className={styles.rangeText}>
                  {config.valueType === "flat"
                    ? i18n.money(g.cents / 100)
                    : t("sim.line", { units: i18n.number(g.units), rate: i18n.rate(g.rate), amount: i18n.money(g.cents / 100) })}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={ui.muted}>{t("sim.fixFirst")}</p>
      )}
    </section>
  );
}
