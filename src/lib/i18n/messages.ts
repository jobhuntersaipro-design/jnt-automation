import { en, type MessageKey, type Messages } from "./en";
import { zh } from "./zh";
import type { Locale } from "./core";

const warned = new Set<string>();

/** The full dictionary for a locale. Missing zh keys fall back to English and are logged once each. */
export function messagesFor(locale: Locale): Messages {
  if (locale === "en") return en;
  const merged: Messages = { ...en };
  for (const key of Object.keys(en) as MessageKey[]) {
    const text = zh[key];
    if (text) merged[key] = text;
    else if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing zh translation for "${key}", using English`);
    }
  }
  return merged;
}
