"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { useI18n } from "@/components/v2/i18n-provider";
import { adoptLanguage } from "@/lib/i18n/actions";
import styles from "./shell.module.css";

type FieldErrors = { email?: string; password?: string };

export function LoginForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    const errors: FieldErrors = {};
    if (!address) errors.email = t("validation.emailRequired");
    else if (!/^\S+@\S+\.\S+$/.test(address)) errors.email = t("validation.emailInvalid");
    if (!password) errors.password = t("validation.passwordRequired");
    setFieldErrors(errors);
    setError("");
    if (errors.email || errors.password) return;

    setPending(true);
    try {
      const result = await signIn("credentials", { email: address, password, redirect: false });
      if (result?.code === "pending_approval") throw Object.assign(new Error(), { code: "pending_approval" });
      if (!result?.ok || result.error) {
        setError(t("login.errorInvalid"));
        setPending(false);
        return;
      }
      await adoptLanguage();
      // Full load: fresh session in every layout, v2 lands on /app, v1 bounces on to /dashboard.
      window.location.href = "/app";
    } catch (err) {
      setError((err as { code?: string }).code === "pending_approval" ? t("login.errorDisabled") : t("login.errorGeneric"));
      setPending(false);
    }
  }

  return (
    <div className={styles.loginCard}>
      <div>
        <h1 className={styles.pageTitle}>{t("login.title")}</h1>
        <p className={styles.pageSubtitle}>{t("login.subtitle")}</p>
      </div>
      <Button variant="secondary" className={styles.fullWidth} onClick={() => signIn("google", { redirectTo: "/app" })}>
        {t("login.google")}
      </Button>
      <div className={styles.divider}>{t("login.or")}</div>
      <form onSubmit={submit} noValidate>
        <Input
          label={t("login.email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <PasswordField
          label={t("login.password")}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          description={fieldErrors.password}
          aria-invalid={fieldErrors.password ? true : undefined}
          messages={{ showPassword: t("login.showPassword"), hidePassword: t("login.hidePassword") }}
        />
        <a href="/auth/forgot-password" className={styles.link}>
          {t("login.forgot")}
        </a>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={pending} className={styles.fullWidth}>
          {pending ? t("login.submitting") : t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
