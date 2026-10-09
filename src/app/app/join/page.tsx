import Image from "next/image";
import { getI18n } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/v2/shell/language-toggle";
import { JoinForm } from "@/components/v2/shell/join-form";
import styles from "@/components/v2/shell/shell.module.css";

// A team invite link: the supervisor sets a password, then is signed in to the owner's account.
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  const { email = "", token = "" } = await searchParams;
  const { t } = await getI18n();
  return (
    <>
      <header className={styles.loginHeader}>
        <Image src="/logo-blue.png" alt={t("app.name")} width={140} height={36} priority className={styles.logo} />
        <LanguageToggle />
      </header>
      <main className={styles.loginMain}>
        <JoinForm email={email} token={token} />
      </main>
    </>
  );
}
