"use client";

import { useCallback, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ConfirmMorph } from "@/components/arc/confirm-morph/confirm-morph";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Input } from "@/components/arc/input/input";
import { LineChart } from "@/components/arc/line-chart/line-chart";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { NumberField } from "@/components/arc/number-field/number-field";
import { Select } from "@/components/arc/select/select";
import { Stepper } from "@/components/arc/stepper/stepper";
import { Switch } from "@/components/arc/switch/switch";
import { DataTable, type Column } from "@/components/v2/data-table/data-table";
import { useI18n } from "@/components/v2/i18n-provider";
import { netPay, sampleDispatchers, type SampleDispatcher } from "./sample-payroll";
import styles from "./design.module.css";

const SAMPLE_SIZE = 300;
// Non-breaking: the counter lays out inline, which would collapse a normal space.
const RM = "RM\u00a0";
const COLOURS = ["background", "surface", "surface-muted", "foreground", "text-secondary", "text-muted", "border", "accent", "accent-strong", "success", "warning", "danger"];
const RADII = ["radius-control", "radius-panel", "radius-surface"];
const MONTHS = [4, 5, 6, 7, 8, 9];

type TableRow = Omit<SampleDispatcher, "vehicle" | "employment"> & { vehicle: string; employment: string; net: number };

export function DesignReview() {
  const i18n = useI18n();
  const { t } = i18n;
  const compact = useMemo(() => new Intl.NumberFormat(i18n.tag, { notation: "compact" }), [i18n.tag]);
  const [dispatchers, setDispatchers] = useState(() => sampleDispatchers(SAMPLE_SIZE));
  const [effective, setEffective] = useState<Date | undefined>();
  const [fuelRate, setFuelRate] = useState(0.2);
  const [kpiFrom, setKpiFrom] = useState(1401);

  const numberFieldText = {
    locale: i18n.tag,
    stepMessages: { increase: t("common.increase"), decrease: t("common.decrease") },
    limitHint: (edge: "min" | "max", limit: number) => t(edge === "min" ? "common.min" : "common.max", { value: i18n.number(limit) }),
  };

  const rows: TableRow[] = useMemo(
    () =>
      dispatchers.map((d) => ({
        ...d,
        vehicle: t(`vehicle.${d.vehicle}`),
        employment: t(`employment.${d.employment}`),
        net: netPay(d),
      })),
    [dispatchers, t],
  );

  const columns: Column<TableRow>[] = useMemo(
    () => [
      { key: "name", header: t("col.dispatcher") },
      { key: "outlet", header: t("col.outlet") },
      { key: "vehicle", header: t("col.vehicle") },
      { key: "employment", header: t("col.employment") },
      { key: "parcels", header: t("col.parcels"), format: "number", total: true },
      { key: "basePay", header: t("col.basePay"), format: "money", total: true },
      { key: "kpi", header: t("col.kpi"), format: "money", editable: true, total: true },
      { key: "fuel", header: t("col.fuel"), format: "money", editable: true, total: true },
      { key: "scRtn", header: t("col.scRtn"), format: "money", total: true },
      { key: "penalty", header: t("col.penalty"), format: "money", editable: true, total: true },
      { key: "net", header: t("col.net"), format: "money", total: true },
    ],
    [t],
  );

  const onEdit = useCallback((row: TableRow, key: keyof TableRow, value: number) => {
    setDispatchers((list) => list.map((d) => (d.id === row.id ? { ...d, [key]: value } : d)));
  }, []);

  const totals = useMemo(
    () => ({
      net: rows.reduce((s, r) => s + r.net, 0),
      parcels: rows.reduce((s, r) => s + r.parcels, 0),
      penalty: rows.reduce((s, r) => s + r.penalty, 0),
    }),
    [rows],
  );

  const chartData = MONTHS.map((m, i) => ({
    key: `2026-${m}`,
    label: i18n.month(2026, m),
    axisLabel: i18n.date(new Date(2026, m - 1, 1), { month: "short" }),
    values: { net: Math.round(totals.net * (0.82 + i * 0.035)), base: Math.round(totals.net * (0.7 + i * 0.03)) },
  }));

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{t("design.title")}</h1>
        <p className={styles.subtitle}>{t("design.subtitle")}</p>
      </header>

      <section className={styles.section}>
        <h2>{t("design.tokens")}</h2>
        <div className={styles.panel}>
          <h3>{t("design.colours")}</h3>
          <div className={styles.swatches}>
            {COLOURS.map((name) => (
              <div key={name} className={styles.swatch}>
                <span className={styles.chip} data-token={name} />
                <code>{`--${name}`}</code>
              </div>
            ))}
          </div>
          <h3>{t("design.type")}</h3>
          <p className={styles.display}>{t("design.typeDisplay")}</p>
          <p className={styles.heading}>{t("design.typeHeading")}</p>
          <p className={styles.body}>{t("design.typeBody")}</p>
          <h3>{t("design.shape")}</h3>
          <div className={styles.swatches}>
            {RADII.map((name) => (
              <div key={name} className={styles.swatch}>
                <span className={styles.radius} data-token={name} />
                <code>{`--${name}`}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t("design.components")}</h2>
        <div className={styles.grid}>
          <div className={styles.panel}>
            <h3>{t("design.buttons")}</h3>
            <div className={styles.row}>
              <Button>{t("common.save")}</Button>
              <Button variant="secondary">{t("common.edit")}</Button>
              <Button variant="ghost">{t("common.cancel")}</Button>
              <Button variant="danger">{t("common.delete")}</Button>
              <Button loading>{t("common.save")}</Button>
            </div>
          </div>

          <div className={styles.panel}>
            <h3>{t("design.status")}</h3>
            <div className={styles.row}>
              <Badge>{t("status.draft")}</Badge>
              <Badge tone="info">{t("status.review")}</Badge>
              <Badge tone="success">{t("status.finalised")}</Badge>
              <Badge tone="warning">{t("status.unmatched")}</Badge>
            </div>
            <Alert tone="warning" title={t("alert.unmatchedTitle")}>
              {t("alert.unmatchedBody")}
            </Alert>
          </div>

          <div className={styles.panel}>
            <h3>{t("design.fields")}</h3>
            <div className={styles.fields}>
              <Input label={t("field.dispatcher")} defaultValue="Ahmad Faiz" />
              <Select
                label={t("field.vehicle")}
                placeholder={t("common.select")}
                defaultValue="bike"
                options={[
                  { value: "bike", label: t("vehicle.bike") },
                  { value: "car", label: t("vehicle.car") },
                  { value: "lorry", label: t("vehicle.lorry") },
                ]}
              />
              <Select
                label={t("field.employment")}
                placeholder={t("common.select")}
                defaultValue="ft"
                options={[
                  { value: "ft", label: t("employment.ft") },
                  { value: "pt", label: t("employment.pt") },
                ]}
              />
              <NumberField
                label={t("field.fuelRate")}
                description={t("field.fuelRateHelp")}
                value={fuelRate}
                onValueChange={setFuelRate}
                step={0.01}
                prefix="RM "
                formatOptions={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                {...numberFieldText}
              />
              <NumberField label={t("field.kpiFrom")} value={kpiFrom} onValueChange={setKpiFrom} step={1} largeStep={100} {...numberFieldText} />
              <DatePicker
                label={t("field.effectiveFrom")}
                placeholder={t("field.pickDate")}
                value={effective}
                onChange={setEffective}
                locale={i18n.tag}
                messages={{
                  clear: t("common.clear"),
                  choose: t("common.chooseDay"),
                  selected: (date) => t("common.selectedDate", { date }),
                  today: t("common.today"),
                  previousMonth: t("common.previousMonth"),
                  nextMonth: t("common.nextMonth"),
                }}
              />
              <Switch label={t("field.active")} defaultChecked />
            </div>
          </div>

          <div className={styles.panel}>
            <h3>{t("design.overlays")}</h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">{t("dialog.open")}</Button>
              </DialogTrigger>
              <DialogContent title={t("dialog.title")} description={t("dialog.body")} closeLabel={t("common.close")}>
                <div className={styles.fields}>
                  <NumberField label={t("field.fuelRate")} defaultValue={0.2} step={0.01} prefix="RM " formatOptions={{ minimumFractionDigits: 2 }} {...numberFieldText} />
                  <DialogClose asChild>
                    <Button>{t("common.save")}</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
            <EmptyState
              icon={<FileUp size={20} aria-hidden="true" />}
              title={t("empty.title")}
              description={t("empty.body")}
              action={<Button variant="secondary">{t("empty.action")}</Button>}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t("design.metrics")}</h2>
        <div className={styles.metrics}>
          <MetricCard label={t("metric.netPayout")} value={totals.net} prefix={RM} decimals={2} locale={i18n.tag} context={i18n.month(2026, 9)} change={t("metric.vsLast", { change: "+4.2%" })} />
          <MetricCard label={t("metric.dispatchers")} value={rows.length} locale={i18n.tag} context={i18n.month(2026, 9)} />
          <MetricCard label={t("metric.parcels")} value={totals.parcels} locale={i18n.tag} context={i18n.month(2026, 9)} />
          <MetricCard label={t("metric.penalties")} value={totals.penalty} prefix={RM} decimals={2} locale={i18n.tag} context={i18n.month(2026, 9)} />
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t("design.flow")}</h2>
        <div className={styles.panel}>
          <Stepper
            label={t("run.label")}
            completeLabel={t("run.complete")}
            current={2}
            steps={[
              { id: "upload", label: t("run.upload"), description: t("run.uploadDetail") },
              { id: "penalties", label: t("run.penalties"), description: t("run.penaltiesDetail") },
              { id: "review", label: t("run.review"), description: t("run.reviewDetail") },
              { id: "finalise", label: t("run.finalise"), description: t("run.finaliseDetail") },
            ]}
          />
          <div className={styles.row}>
            <ConfirmMorph
              label={t("run.finaliseAction")}
              prompt={t("run.finalisePrompt")}
              confirmLabel={t("run.finaliseConfirm")}
              cancelLabel={t("common.cancel")}
              pendingLabel={t("run.finalising")}
              doneLabel={t("run.finalised")}
              errorLabel={t("common.failed")}
              retryLabel={t("common.retry")}
              tone="neutral"
              onConfirm={() => new Promise((resolve) => setTimeout(resolve, 900))}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t("design.chart")}</h2>
        <div className={styles.panel}>
          <LineChart
            label={t("chart.title")}
            categoryLabel={t("chart.month")}
            data={chartData}
            series={[
              { key: "net", label: t("chart.net") },
              { key: "base", label: t("chart.base") },
            ]}
            formatValue={(v) => i18n.money(v)}
            formatTick={(v) => compact.format(v)}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2>{t("design.table")}</h2>
        <p className={styles.note}>{t("design.tableNote", { count: i18n.number(SAMPLE_SIZE) })}</p>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={rowKey}
          rowLabel={rowLabel}
          searchKeys={SEARCH_KEYS}
          onEdit={onEdit}
          exportName="payroll-sample"
        />
        <p className={styles.note}>{t("table.editHint")}</p>
      </section>
    </div>
  );
}

const rowKey = (r: TableRow) => r.id;
const rowLabel = (r: TableRow) => r.name;
const SEARCH_KEYS: (keyof TableRow & string)[] = ["name", "id", "outlet"];
