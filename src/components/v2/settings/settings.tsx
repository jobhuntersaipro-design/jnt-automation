"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { CreditCard, Download, ImageUp } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { NumberField } from "@/components/arc/number-field/number-field";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { Textarea } from "@/components/arc/textarea/textarea";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import { changePassword, updateCompany } from "@/lib/v2/account/actions";
import type { Period } from "@/lib/v2/pay/resolve";
import type { TeamMemberView } from "@/lib/v2/team/data";
import { monthLabel } from "../labels";
import { Team } from "./team";
import ui from "../ui.module.css";
import styles from "./settings.module.css";

export interface AccountView {
  name: string;
  email: string;
  companyRegistrationNo: string | null;
  companyAddress: string | null;
  stampImageUrl: string | null;
  hasPassword: boolean;
}

export interface PlanView {
  limit: number;
  inUse: number;
  max: number;
  price: number;
  /** Admin accounts aren't billed. */
  exempt: boolean;
  /** ISO date while the free trial runs. */
  trialEnd: string | null;
  firstInvoice: Period;
  nextInvoice: Period;
  payOnline: boolean;
  supportEmail: string;
  invoices: { period: Period; outlets: number; amount: number; paid: boolean }[];
}

/** A branch supervisor's settings: their own password only (the account's details are the owner's). */
export function MemberSettings({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();
  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("settings.title")}</h1>
          <p className={ui.subtitle}>{t("team.memberSettings")}</p>
        </div>
      </header>
      <div className={ui.grid}>{hasPassword && <Password />}</div>
    </div>
  );
}

/** v2 settings: company details on payslips, the stamp, password, plan & billing, and the team. */
export function Settings({
  account,
  plan,
  viewingAs,
  team,
}: {
  account: AccountView;
  plan: PlanView;
  viewingAs: string | null;
  team: { members: TeamMemberView[]; branches: { id: string; code: string }[] };
}) {
  const { t } = useI18n();
  return (
    <div className={ui.page}>
      <header className={ui.pageHeader}>
        <div>
          <h1 className={ui.title}>{t("settings.title")}</h1>
          <p className={ui.subtitle}>{t(!viewingAs && account.hasPassword ? "settings.subtitle" : "settings.subtitleNoPassword")}</p>
        </div>
      </header>
      {viewingAs && <Alert tone="info" title={t("settings.ownOnly", { name: viewingAs })} />}
      <div className={ui.grid}>
        <Company account={account} />
        {!viewingAs && <Stamp url={account.stampImageUrl} />}
        {!viewingAs && <Plan plan={plan} />}
        {!viewingAs && account.hasPassword && <Password />}
        <Team members={team.members} branches={team.branches} />
      </div>
    </div>
  );
}

function Company({ account }: { account: AccountView }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: account.name, companyRegistrationNo: account.companyRegistrationNo ?? "", companyAddress: account.companyAddress ?? "" });
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await updateCompany(form);
    setSaving(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    toast.success(t("settings.saved"));
    router.refresh();
  }

  return (
    <form className={ui.card} onSubmit={save} aria-labelledby="company-title">
      <div>
        <h2 id="company-title" className={ui.cardTitle}>
          {t("settings.company")}
        </h2>
        <p className={ui.help}>{t("settings.companyHelp")}</p>
      </div>
      <Input label={t("settings.email")} value={account.email} readOnly />
      <Input label={t("settings.name")} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} required />
      <Input label={t("settings.regNo")} value={form.companyRegistrationNo} onChange={(e) => set({ companyRegistrationNo: e.target.value })} maxLength={50} />
      <Textarea label={t("settings.address")} value={form.companyAddress} onChange={(e) => set({ companyAddress: e.target.value })} maxLength={500} rows={3} />
      <div>
        <Button type="submit" loading={saving} disabled={!form.name.trim()}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

const STAMP_TYPES = ["image/jpeg", "image/png", "image/webp"];
const STAMP_MAX_BYTES = 2 * 1024 * 1024;

/** The stamp goes through the account's shared stamp upload, which also clears a white background. */
function Stamp({ url }: { url: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!STAMP_TYPES.includes(file.type)) return toast.error(t("settings.err.stampType"));
    if (file.size > STAMP_MAX_BYTES) return toast.error(t("settings.err.stampSize"));
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/settings/stamp", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error(t("common.failed"));
    toast.success(t("settings.stampSaved"));
    router.refresh();
  }

  return (
    <section className={ui.card} aria-labelledby="stamp-title">
      <div>
        <h2 id="stamp-title" className={ui.cardTitle}>
          {t("settings.stamp")}
        </h2>
        <p className={ui.help}>{t("settings.stampHelp")}</p>
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from the R2 public host
        <img src={url} alt={t("settings.stamp")} className={styles.stamp} />
      ) : (
        <p className={ui.muted}>{t("settings.stampNone")}</p>
      )}
      <input
        ref={input}
        type="file"
        accept={STAMP_TYPES.join(",")}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <div className={ui.row}>
        <Button variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          <ImageUp size={16} aria-hidden="true" />
          {t(url ? "settings.stampReplace" : "settings.stampUpload")}
        </Button>
        {url && (
          <ConfirmButton
            confirmVariant="danger"
            label={t("settings.stampRemove")}
            prompt={t("settings.stampRemovePrompt")}
            confirmLabel={t("settings.stampRemove")}
            doneLabel={t("settings.stampRemoved")}
            onConfirm={async () => {
              const res = await fetch("/api/settings/stamp", { method: "DELETE" }).catch(() => null);
              if (!res?.ok) throw new Error("stamp");
              router.refresh();
            }}
          />
        )}
      </div>
    </section>
  );
}

function Password() {
  const { t } = useI18n();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const messages = { showPassword: t("login.showPassword"), hidePassword: t("login.hidePassword") };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (form.next.length < 8 || form.next.length > 128) return setError(t("settings.err.passwordLength"));
    if (form.next !== form.confirm) return setError(t("settings.err.passwordMatch"));
    setSaving(true);
    const r = await changePassword({ current: form.current, next: form.next });
    setSaving(false);
    if (!r.ok) return setError(t(r.error, r.vars));
    setError(null);
    setForm({ current: "", next: "", confirm: "" });
    toast.success(t("settings.passwordChanged"));
  }

  return (
    <form className={ui.card} onSubmit={save} aria-labelledby="password-title" noValidate>
      <h2 id="password-title" className={ui.cardTitle}>
        {t("settings.password")}
      </h2>
      <PasswordField label={t("settings.currentPassword")} autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} messages={messages} />
      <PasswordField label={t("settings.newPassword")} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} messages={messages} />
      <PasswordField label={t("settings.confirmPassword")} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} messages={messages} />
      {error && <Alert tone="danger" title={error} />}
      <div>
        <Button type="submit" loading={saving} disabled={!form.current || !form.next}>
          {t("settings.changePassword")}
        </Button>
      </div>
    </form>
  );
}

/** Outlet limit (billed per outlet per month) and the account's invoices; changes go through the shared plan API. */
function Plan({ plan }: { plan: PlanView }) {
  const i18n = useI18n();
  const { t, tp } = i18n;
  const router = useRouter();
  const [limit, setLimit] = useState(plan.limit);
  const [paying, setPaying] = useState<Period | null>(null);
  const min = Math.max(1, plan.inUse);
  const price = (n: number) => i18n.money(n * plan.price);

  async function pay(period: Period) {
    setPaying(period);
    const res = await fetch(`/api/settings/invoices/${Math.floor(period / 100)}/${period % 100}/pay`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { url?: string } | null;
    if (res?.ok && data?.url) return window.location.assign(data.url);
    setPaying(null);
    toast.error(t("common.failed"));
  }

  return (
    <section className={ui.card} aria-labelledby="plan-title">
      <div>
        <h2 id="plan-title" className={ui.cardTitle}>
          {t("settings.plan")}
        </h2>
        <p className={ui.help}>{t("settings.planHelp", { price: i18n.number(plan.price) })}</p>
      </div>
      <div className={styles.plan}>
        <NumberField
          label={t("settings.limit")}
          value={limit}
          min={min}
          max={plan.max}
          onValueChange={setLimit}
          locale={i18n.tag}
          description={tp("settings.inUse", plan.inUse)}
          stepMessages={{ increase: t("common.increase"), decrease: t("common.decrease") }}
          limitHint={(edge, value) => (edge === "min" ? t("settings.err.limitMin", { count: value }) : t("settings.err.limitMax", { count: value, email: plan.supportEmail }))}
        />
        <div className={ui.field}>
          <span className={ui.label}>{t("settings.monthly")}</span>
          <strong className={styles.price}>{plan.exempt ? t("settings.exemptShort") : price(limit)}</strong>
        </div>
      </div>
      <p className={ui.help}>
        {plan.exempt
          ? t("settings.exempt")
          : plan.trialEnd
            ? t("settings.trial", { date: i18n.date(new Date(plan.trialEnd)), month: monthLabel(i18n, plan.firstInvoice) })
            : t("settings.billed", { month: monthLabel(i18n, plan.nextInvoice) })}
      </p>
      {limit !== plan.limit && (
        <ConfirmButton
          label={t("settings.limitSave")}
          prompt={tp("settings.limitPrompt", limit, { amount: price(limit), month: monthLabel(i18n, plan.nextInvoice) })}
          confirmLabel={t("settings.limitSave")}
          doneLabel={t("settings.limitSaved", { count: limit })}
          onConfirm={async () => {
            const res = await fetch("/api/settings/plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxBranches: limit }) }).catch(() => null);
            if (!res?.ok) {
              toast.error(t("common.failed"));
              throw new Error("plan");
            }
            router.refresh();
          }}
        />
      )}

      <h3 className={ui.sectionTitle}>{t("settings.invoices")}</h3>
      {plan.invoices.length === 0 ? (
        <p className={ui.muted}>{t("settings.invoicesNone")}</p>
      ) : (
        <ul className={ui.list}>
          {plan.invoices.map((inv) => {
            const month = monthLabel(i18n, inv.period);
            return (
              <li key={inv.period}>
                <span className={styles.invoice}>
                  <strong>{month}</strong>
                  <span className={ui.help}>{t("settings.invoiceLine", { count: inv.outlets, price: i18n.number(plan.price) })}</span>
                </span>
                <span className={ui.row}>
                  <span className={styles.price}>{i18n.money(inv.amount)}</span>
                  <Badge tone={inv.paid ? "success" : "warning"} size="sm">
                    {t(inv.paid ? "settings.invoice.paid" : "settings.invoice.due")}
                  </Badge>
                  <a className={ui.link} href={`/api/settings/invoices/${Math.floor(inv.period / 100)}/${inv.period % 100}`} aria-label={t("settings.invoice.download", { month })}>
                    <Download size={16} aria-hidden="true" />
                  </a>
                  {!inv.paid && plan.payOnline && (
                    <Button size="sm" loading={paying === inv.period} onClick={() => pay(inv.period)}>
                      <CreditCard size={16} aria-hidden="true" />
                      {t("settings.invoice.pay")}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
