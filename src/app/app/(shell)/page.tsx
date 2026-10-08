import { getI18n } from "@/lib/i18n/server";
import styles from "@/components/v2/shell/shell.module.css";

export default async function V2Dashboard() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className={styles.pageTitle}>{t("dashboard.title")}</h1>
      <p className={styles.pageSubtitle}>{t("dashboard.setup")}</p>
    </>
  );
}
