import type { MessageKey, Messages } from "./en";

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "es-lang";

/** BCP 47 tag used for the lang attribute and Intl formatting. */
export const LOCALE_TAG: Record<Locale, string> = { en: "en-MY", zh: "zh-CN" };

export function parseLocale(value: string | null | undefined): Locale | null {
  return LOCALES.find((l) => l === value) ?? null;
}

/** First of zh/en in the browser's Accept-Language, by q-value; null when neither is listed. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = parseLocale(tag.split("-")[0]);
    if (base) return base;
  }
  return null;
}

export type TranslateVars = Record<string, string | number>;
type PluralBase<K> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBase<MessageKey>;

export function createI18n(locale: Locale, messages: Messages) {
  const tag = LOCALE_TAG[locale];
  const plural = new Intl.PluralRules(tag);
  const numberFmt = new Intl.NumberFormat(tag);
  const moneyFmt = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function t(key: MessageKey, vars?: TranslateVars): string {
    const text = messages[key] ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
  }

  /** Plural form of `key.one` / `key.other`; {count} is filled in. */
  function tp(key: PluralKey, count: number, vars?: TranslateVars): string {
    const form = plural.select(count) === "one" ? "one" : "other";
    return t(`${key}.${form}` as MessageKey, { count: numberFmt.format(count), ...vars });
  }

  return {
    locale,
    tag,
    t,
    tp,
    number: (n: number) => numberFmt.format(n),
    /** Always RM, in both languages. */
    money: (n: number) => `RM ${moneyFmt.format(n)}`,
    date: (d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
      new Intl.DateTimeFormat(tag, opts).format(d),
    month: (year: number, month: number) =>
      new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)),
  };
}

export type I18n = ReturnType<typeof createI18n>;
