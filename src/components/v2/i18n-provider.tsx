"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { createI18n, type I18n, type Locale } from "@/lib/i18n/core";
import type { Messages } from "@/lib/i18n/en";

const I18nContext = createContext<I18n | null>(null);

/** Gives v2 client components the active language (the server picks it and passes its dictionary). */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const i18n = useMemo(() => createI18n(locale, messages), [locale, messages]);
  useEffect(() => {
    document.documentElement.lang = i18n.tag;
  }, [i18n.tag]);
  return <I18nContext value={i18n}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error("useI18n must be used inside <I18nProvider>");
  return i18n;
}
