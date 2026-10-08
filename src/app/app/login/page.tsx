import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getI18n } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/v2/shell/language-toggle";
import { LoginForm } from "@/components/v2/shell/login-form";
import styles from "@/components/v2/shell/shell.module.css";

// v2 sign-in. Same accounts and auth as v1; signed-in users go to /app (v1 accounts bounce on to /dashboard).
export default async function V2Login() {
  const session = await auth();
  if (session?.user?.id && session.user.isApproved) redirect("/app");
  const { t } = await getI18n();

  return (
    <>
      <header className={styles.loginHeader}>
        <Image src="/logo-blue.png" alt={t("app.name")} width={140} height={36} priority className={styles.logo} />
        <LanguageToggle />
      </header>
      <main className={styles.loginMain}>
        <LoginForm />
      </main>
    </>
  );
}
