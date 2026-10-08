import { afterEach, describe, expect, it, vi } from "vitest";
import { en, type MessageKey } from "./en";
import { zh } from "./zh";
import { createI18n, localeFromAcceptLanguage, parseLocale } from "./core";

describe("dictionaries", () => {
  it("zh translates every English key (the admin UI must be complete in Chinese)", () => {
    const missing = (Object.keys(en) as MessageKey[]).filter((k) => !zh[k]);
    expect(missing).toEqual([]);
  });

  it("zh has no keys English doesn't", () => {
    expect(Object.keys(zh).filter((k) => !(k in en))).toEqual([]);
  });

  it("zh keeps every {placeholder} the English string uses", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(vars(zh[key] ?? ""), key).toEqual(vars(en[key]));
    }
  });
});

describe("messagesFor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("falls back to English for a missing zh key and logs it once", async () => {
    vi.doMock("./zh", () => ({ zh: { "common.save": "保存" } }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { messagesFor } = await import("./messages");
    const zhMessages = messagesFor("zh");
    expect(zhMessages["common.save"]).toBe("保存");
    expect(zhMessages["common.cancel"]).toBe("Cancel");
    messagesFor("zh");
    const cancelWarnings = warn.mock.calls.filter(([m]) => String(m).includes('"common.cancel"'));
    expect(cancelWarnings).toHaveLength(1);
  });
});

describe("createI18n", () => {
  const t = createI18n("en", en);

  it("fills {vars}", () => {
    expect(t.t("user.viewingAs", { name: "Vivian" })).toBe("Viewing as Vivian");
  });

  it("picks plural forms", () => {
    expect(t.tp("table.rows", 1)).toBe("1 dispatcher");
    expect(t.tp("table.rows", 1200)).toBe("1,200 dispatchers");
  });

  it("formats money as RM in both languages", () => {
    expect(t.money(1234.5)).toBe("RM 1,234.50");
    expect(createI18n("zh", en).money(1234.5)).toBe("RM 1,234.50");
    expect(t.rate(0.1234)).toBe("RM 0.1234");
    expect(t.rate(1.4)).toBe("RM 1.40");
  });

  it("formats months per language", () => {
    expect(createI18n("zh", en).month(2026, 9)).toBe("2026年9月");
    expect(t.month(2026, 9)).toBe("September 2026");
  });
});

describe("locale parsing", () => {
  it("accepts only supported locales", () => {
    expect(parseLocale("zh")).toBe("zh");
    expect(parseLocale("fr")).toBeNull();
    expect(parseLocale(undefined)).toBeNull();
  });

  it("reads the browser's preferred language by q-value", () => {
    expect(localeFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("ms-MY,en;q=0.5,zh-CN;q=0.7")).toBe("zh");
    expect(localeFromAcceptLanguage("ms-MY")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});
