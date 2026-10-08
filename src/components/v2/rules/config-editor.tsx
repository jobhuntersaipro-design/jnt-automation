"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Switch } from "@/components/arc/switch/switch";
import { DecimalInput } from "@/components/v2/decimal-input";
import { useI18n } from "@/components/v2/i18n-provider";
import { addBound, penaltyTypeOf, removeBound, setBound, setByVehicle, unitsFor, VEHICLES, type Kind, type RuleConfig, type Unit } from "@/lib/v2/pay/config";
import { rangeLabels, unitLabel, vehicleLabel } from "../labels";
import ui from "../ui.module.css";
import styles from "./rules.module.css";

/** Edits one rule version: what it counts, how it pays, tiers, weight bands and the rate table. */
export function ConfigEditor({ kind, config, onChange }: { kind: Kind; config: RuleConfig; onChange: (next: RuleConfig) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const flat = config.valueType === "flat";
  // Penalties weigh nothing: no weight bands, unless an import brought some (so they can be removed).
  const penalty = penaltyTypeOf(config.unit) !== null;

  return (
    <div className={ui.stack}>
      <div className={styles.options}>
        <Select
          label={t("rule.counts")}
          value={config.unit}
          onValueChange={(unit) => onChange({ ...config, unit: unit as Unit })}
          options={unitsFor(kind).map((u) => ({ value: u, label: unitLabel(i18n, u) }))}
        />
        <div className={ui.field}>
          <span className={ui.label}>{t("rule.pays")}</span>
          <SegmentedControl
            label={t("rule.pays")}
            value={config.valueType}
            onValueChange={(v) => {
              const valueType = v === "flat" ? "flat" : "per_unit";
              // A flat amount has one band; drop the others so the config stays valid.
              let next: RuleConfig = { ...config, valueType };
              if (valueType === "flat") while (next.bands.length > 1) next = removeBound(next, "bands", 0);
              onChange(next);
            }}
            options={[
              { value: "per_unit", label: t("valueType.per_unit") },
              { value: "flat", label: t("valueType.flat") },
            ]}
          />
        </div>
        <div className={ui.field}>
          <span className={ui.label}>{t("rule.vehicles")}</span>
          <Switch label={t("rule.byVehicle")} checked={config.byVehicle} onCheckedChange={(on) => onChange(setByVehicle(config, on))} />
        </div>
      </div>

      <section className={ui.stack} aria-labelledby="tiers-title">
        <div>
          <h3 id="tiers-title" className={ui.sectionTitle}>
            {t("rule.tiers")}
          </h3>
          <p className={ui.help}>{t(flat ? "rule.tiersHelpFlat" : "rule.tiersHelp")}</p>
        </div>
        <Bounds config={config} axis="tiers" onChange={onChange} />
        {config.tiers.length > 1 && !flat && (
          <div className={ui.field}>
            <span className={ui.label}>{t("rule.basis")}</span>
            <div className={styles.fit}>
              <SegmentedControl
              label={t("rule.basis")}
              value={config.basis}
              onValueChange={(v) => onChange({ ...config, basis: v === "marginal" ? "marginal" : "whole" })}
              options={[
                { value: "whole", label: t("basis.whole") },
                { value: "marginal", label: t("basis.marginal") },
                ]}
              />
            </div>
            <p className={ui.help}>{t(config.basis === "whole" ? "basis.whole.help" : "basis.marginal.help")}</p>
          </div>
        )}
      </section>

      {!flat && (!penalty || config.bands.length > 1) && (
        <section className={ui.stack} aria-labelledby="bands-title">
          <div>
            <h3 id="bands-title" className={ui.sectionTitle}>
              {t("rule.bands")}
            </h3>
            <p className={ui.help}>{t("rule.bandsHelp")}</p>
          </div>
          <Bounds config={config} axis="bands" onChange={onChange} />
        </section>
      )}

      <section className={ui.stack} aria-labelledby="rates-title">
        <h3 id="rates-title" className={ui.sectionTitle}>
          {t(flat ? "rule.amounts" : "rule.rates")}
        </h3>
        <Rates config={config} onChange={onChange} />
      </section>
    </div>
  );
}

function Bounds({ config, axis, onChange }: { config: RuleConfig; axis: "tiers" | "bands"; onChange: (next: RuleConfig) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const list = config[axis];
  const kind = axis === "tiers" ? "count" : "kg";
  const ranges = rangeLabels(i18n, list, kind);
  const unit = t(axis === "tiers" ? (penaltyTypeOf(config.unit) ? "rule.cases" : "rule.parcels") : "rule.kg");

  return (
    <div className={styles.bounds}>
      {list.map((bound, i) => (
        <div key={i} className={styles.boundRow}>
          {bound === null ? (
            <span className={ui.muted}>{t("rule.andAbove")}</span>
          ) : (
            <DecimalInput
              className={styles.fill}
              label={t("rule.upToLabel", { n: i + 1, unit })}
              value={bound}
              onValueChange={(n) => onChange(setBound(config, axis, i, n))}
            />
          )}
          <span className={styles.rangeText}>{ranges[i]}</span>
          {bound !== null ? (
            <Button variant="ghost" size="sm" aria-label={t("rule.removeRange", { range: ranges[i] })} onClick={() => onChange(removeBound(config, axis, i))}>
              <X size={16} aria-hidden="true" />
            </Button>
          ) : (
            <span />
          )}
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => onChange(addBound(config, axis))}>
          <Plus size={16} aria-hidden="true" />
          {t(axis === "tiers" ? "rule.addTier" : "rule.addBand")}
        </Button>
      </div>
    </div>
  );
}

function Rates({ config, onChange }: { config: RuleConfig; onChange: (next: RuleConfig) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const penalty = penaltyTypeOf(config.unit) !== null;
  const tierRanges = rangeLabels(i18n, config.tiers, "count");
  const bandRanges = penalty && config.bands.length === 1 ? [t("rule.eachCase")] : rangeLabels(i18n, config.bands, "kg");
  const columns = config.byVehicle ? VEHICLES.map((v) => vehicleLabel(i18n, v)) : [t(config.valueType === "flat" ? "rule.amount" : "rule.rate")];

  function setRate(tier: number, band: number, col: number, value: number) {
    const values = config.values.map((tr, ti) => tr.map((br, bi) => br.map((r, ci) => (ti === tier && bi === band && ci === col ? value : r))));
    onChange({ ...config, values });
  }

  return config.values.map((tierValues, ti) => (
    <div key={ti} className={ui.stack}>
      {config.tiers.length > 1 && <p className={styles.tierHeading}>{t(penalty ? "rule.tierHeadingCases" : "rule.tierHeading", { n: ti + 1, range: tierRanges[ti] })}</p>}
      <div className={styles.ratesWrap}>
        <table className={styles.rates}>
          <thead>
            <tr>
              <th scope="col">{t(penalty ? "sim.cases" : "rule.weight")}</th>
              {columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tierValues.map((bandValues, bi) => (
              <tr key={bi}>
                <th scope="row">{bandRanges[bi]}</th>
                {bandValues.map((rate, ci) => (
                  <td key={ci}>
                    <DecimalInput
                      className={styles.rateInput}
                      label={t("rule.rateLabel", { column: columns[ci], weight: bandRanges[bi], tier: tierRanges[ti] })}
                      value={rate}
                      onValueChange={(n) => setRate(ti, bi, ci, n)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}
