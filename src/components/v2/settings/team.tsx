"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { Input } from "@/components/arc/input/input";
import { ConfirmButton } from "@/components/v2/confirm-button";
import { useI18n } from "@/components/v2/i18n-provider";
import { inviteMember, removeMember, resendInvite, setMemberBranches } from "@/lib/v2/team/actions";
import type { TeamMemberView } from "@/lib/v2/team/data";
import ui from "../ui.module.css";
import styles from "./settings.module.css";

type Branch = { id: string; code: string };

function BranchPicks({ branches, value, onChange, idPrefix }: { branches: Branch[]; value: string[]; onChange: (ids: string[]) => void; idPrefix: string }) {
  const { t } = useI18n();
  return (
    <fieldset className={styles.branches}>
      <legend className={ui.label}>{t("team.branches")}</legend>
      {branches.map((b) => (
        <Checkbox
          key={b.id}
          id={`${idPrefix}-${b.id}`}
          label={b.code}
          checked={value.includes(b.id)}
          onCheckedChange={(on) => onChange(on === true ? [...value, b.id] : value.filter((id) => id !== b.id))}
        />
      ))}
    </fieldset>
  );
}

/** The link someone can open to set their password, also when the email didn't go out. */
function InviteLink({ link, emailed }: { link: string; emailed: boolean }) {
  const { t } = useI18n();
  return (
    <div className={ui.stack}>
      <Alert tone={emailed ? "success" : "warning"} title={t(emailed ? "team.emailed" : "team.notEmailed")} />
      <div className={ui.row}>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => null);
            toast.success(t("send.copied"));
          }}
        >
          <Link2 size={16} aria-hidden="true" />
          {t("team.copyLink")}
        </Button>
      </div>
    </div>
  );
}

function Member({ m, branches }: { m: TeamMemberView; branches: Branch[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [ids, setIds] = useState(m.branchIds);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<{ link: string; emailed: boolean } | null>(null);
  const changed = ids.length !== m.branchIds.length || ids.some((id) => !m.branchIds.includes(id));

  return (
    <li className={styles.member}>
      <span className={styles.memberHead}>
        <strong>{m.name}</strong>
        <span className={ui.help}>{m.email}</span>
        <Badge tone={m.joined ? "success" : "warning"} size="sm">
          {t(m.joined ? "team.joined" : "team.invited")}
        </Badge>
      </span>
      <BranchPicks branches={branches} value={ids} onChange={setIds} idPrefix={m.id} />
      <div className={ui.row}>
        {changed && (
          <Button
            size="sm"
            loading={saving}
            disabled={ids.length === 0}
            onClick={async () => {
              setSaving(true);
              const r = await setMemberBranches({ id: m.id, branchIds: ids });
              setSaving(false);
              if (!r.ok) return toast.error(t(r.error, r.vars));
              toast.success(t("team.saved"));
              router.refresh();
            }}
          >
            {t("common.save")}
          </Button>
        )}
        {!m.joined && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const r = await resendInvite({ id: m.id });
              if (!r.ok) return toast.error(t(r.error, r.vars));
              setSent(r.data);
            }}
          >
            {t("team.resend")}
          </Button>
        )}
        <ConfirmButton
          confirmVariant="danger"
          label={t("team.remove")}
          prompt={t("team.removePrompt", { name: m.name })}
          confirmLabel={t("team.remove")}
          doneLabel={t("team.removed")}
          onConfirm={async () => {
            const r = await removeMember({ id: m.id });
            if (!r.ok) {
              toast.error(t(r.error, r.vars));
              throw new Error(r.error);
            }
            router.refresh();
          }}
        />
      </div>
      {sent && <InviteLink {...sent} />}
    </li>
  );
}

/** Branch supervisors: invited by email, prepare payroll for their branches; the owner finalises. */
export function Team({ members, branches }: { members: TeamMemberView[]; branches: Branch[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", branchIds: [] as string[] });
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ link: string; emailed: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    const r = await inviteMember(form);
    setPending(false);
    if (!r.ok) return toast.error(t(r.error, r.vars));
    setSent(r.data);
    setForm({ name: "", email: "", branchIds: [] });
    router.refresh();
  }

  return (
    <section className={ui.card} aria-labelledby="team-title">
      <div>
        <h2 id="team-title" className={ui.cardTitle}>
          {t("team.title")}
        </h2>
        <p className={ui.help}>{t("team.help")}</p>
      </div>
      {members.length > 0 && (
        <ul className={styles.members}>
          {members.map((m) => (
            <Member key={`${m.id}:${m.branchIds.join()}`} m={m} branches={branches} />
          ))}
        </ul>
      )}
      {branches.length === 0 ? (
        <p className={ui.help}>{t("team.noBranches")}</p>
      ) : (
        <form className={ui.stack} onSubmit={submit} noValidate>
          <h3 className={ui.label}>{t("team.invite")}</h3>
          <Input label={t("team.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
          <Input label={t("team.email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
          <BranchPicks branches={branches} value={form.branchIds} onChange={(branchIds) => setForm({ ...form, branchIds })} idPrefix="new" />
          <div>
            <Button type="submit" loading={pending} disabled={!form.name.trim() || !form.email.trim() || form.branchIds.length === 0}>
              {t("team.send")}
            </Button>
          </div>
          {sent && <InviteLink {...sent} />}
        </form>
      )}
    </section>
  );
}
