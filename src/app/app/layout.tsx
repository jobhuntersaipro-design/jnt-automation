import type { Metadata } from "next";
import "@/components/arc/foundation.css";
import "@/components/v2/tokens.css";
import { getLocale } from "@/lib/i18n/server";
import { messagesFor } from "@/lib/i18n/messages";
import { LOCALE_TAG } from "@/lib/i18n/core";
import { I18nProvider } from "@/components/v2/i18n-provider";
import styles from "@/components/v2/shell/shell.module.css";

export const metadata: Metadata = { title: "EasyStaff" };

// Root of the v2 app (/app/*): Arc + EasyStaff tokens and the UI language.
// Only v2 routes import these styles, so v1 pages and their bundles never load them.
export default async function V2Root({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <div lang={LOCALE_TAG[locale]} className={styles.root}>
        {children}
      </div>
    </I18nProvider>
  );
}
