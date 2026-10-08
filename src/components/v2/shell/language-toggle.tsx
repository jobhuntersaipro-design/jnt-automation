"use client";

import { useOptimistic, useSyncExternalStore, useTransition } from "react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { useI18n } from "@/components/v2/i18n-provider";
import { setLanguage } from "@/lib/i18n/actions";

const NARROW = "(max-width: 40rem)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** 中文 / English switch for the top-right of every v2 page. Saving the cookie re-renders the page on the server; no reload. */
export function LanguageToggle() {
  const { locale, t } = useI18n();
  const [shown, setShown] = useOptimistic(locale);
  const [, startTransition] = useTransition();
  const narrow = useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);

  function change(next: string) {
    if (next === shown) return;
    startTransition(async () => {
      setShown(next === "zh" ? "zh" : "en");
      await setLanguage(next);
    });
  }

  return (
    <SegmentedControl
      label={t("lang.label")}
      value={shown}
      onValueChange={change}
      options={[
        { value: "zh", label: narrow ? t("lang.zhShort") : t("lang.zh") },
        { value: "en", label: narrow ? t("lang.enShort") : t("lang.en") },
      ]}
    />
  );
}
