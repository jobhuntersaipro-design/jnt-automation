import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { createI18n, LOCALE_COOKIE, localeFromAcceptLanguage, parseLocale, type Locale } from "./core";
import { messagesFor } from "./messages";

/**
 * The v2 UI language for this request: the signed-in user's saved choice, then the
 * language cookie (set by the toggle, also before sign-in), then the browser, then English.
 * An admin viewing as an agent sees the agent's language until they toggle it themselves.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookie = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const effective = await getEffectiveAgentId();
  const profile = effective
    ? (await prisma.agent.findUnique({ where: { id: effective.agentId }, select: { language: true } }))?.language ?? null
    : null;
  const chosen = effective?.impersonating ? cookie ?? profile : profile ?? cookie;
  return chosen ?? localeFromAcceptLanguage((await headers()).get("accept-language")) ?? "en";
});

/** Translator for server components. */
export async function getI18n() {
  const locale = await getLocale();
  return createI18n(locale, messagesFor(locale));
}
