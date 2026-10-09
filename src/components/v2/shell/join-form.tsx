"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/arc/button/button";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { useI18n } from "@/components/v2/i18n-provider";
import { adoptLanguage } from "@/lib/i18n/actions";
import { acceptInvite } from "@/lib/v2/team/actions";
import styles from "./shell.module.css";

/** Sets a team member's password from their invite link, then signs them in. */
export function JoinForm({ email, token }: { email: string; token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const messages = { showPassword: t("login.showPassword"), hidePassword: t("login.hidePassword") };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8 || password.length > 128) return setError(t("settings.err.passwordLength"));
    if (password !== confirm) return setError(t("settings.err.passwordMatch"));
    setError("");
    setPending(true);
    const r = await acceptInvite({ email, token, password });
    if (!r.ok) {
      setPending(false);
      return setError(t(r.error, r.vars));
    }
    const result = await signIn("credentials", { email, password, redirect: false }).catch(() => null);
    if (!result?.ok || result.error) {
      window.location.href = "/app/login";
      return;
    }
    await adoptLanguage();
    window.location.href = "/app";
  }

  return (
    <div className={styles.loginCard}>
      <div>
        <h1 className={styles.pageTitle}>{t("team.joinTitle")}</h1>
        <p className={styles.pageSubtitle}>{t("team.joinSubtitle", { email })}</p>
      </div>
      <form onSubmit={submit} noValidate>
        <PasswordField label={t("settings.newPassword")} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} messages={messages} />
        <PasswordField label={t("settings.confirmPassword")} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} messages={messages} />
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={pending} disabled={!password || !confirm} className={styles.fullWidth}>
          {t("team.join")}
        </Button>
      </form>
    </div>
  );
}
