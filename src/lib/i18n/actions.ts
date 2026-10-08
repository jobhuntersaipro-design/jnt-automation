"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getEffectiveAgentId } from "@/lib/impersonation";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./core";

const YEAR = 60 * 60 * 24 * 365;

async function saveToProfile(locale: Locale) {
  const effective = await getEffectiveAgentId();
  // An admin viewing as an agent changes only their own cookie, never the agent's choice.
  if (effective && !effective.impersonating) {
    await prisma.agent.update({ where: { id: effective.agentId }, data: { language: locale } });
  }
}

/** Language toggle: remembered in a cookie, and on the profile when signed in. */
export async function setLanguage(value: string) {
  const locale = parseLocale(value);
  if (!locale) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  await saveToProfile(locale);
}

/** Right after sign-in: the language picked on the sign-in page becomes the profile's. */
export async function adoptLanguage() {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (locale) await saveToProfile(locale);
}
