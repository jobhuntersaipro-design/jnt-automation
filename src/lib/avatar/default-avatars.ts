/**
 * Pre-bundled default avatars (DiceBear Notionists).
 * Each SVG is baked with one of the branch-chip hexBg pale tones
 * (see `src/lib/branch-colors.ts`) so the grid matches the colour
 * vocabulary used on the Branches page and branch chips.
 * SVG files are served statically from /public/avatars/defaults/.
 */

export const DEFAULT_AVATAR_URL_PREFIX = "/avatars/defaults/";

export interface DefaultAvatar {
  id: string;
  url: string;
}

const DEFAULT_AVATAR_IDS = [
  "notionists-01",
  "notionists-02",
  "notionists-03",
  "notionists-04",
  "notionists-05",
  "notionists-06",
  "notionists-07",
  "notionists-08",
  "notionists-09",
  "notionists-10",
  "notionists-11",
  "notionists-12",
] as const;

export const DEFAULT_AVATARS: DefaultAvatar[] = DEFAULT_AVATAR_IDS.map((id) => ({
  id,
  url: `${DEFAULT_AVATAR_URL_PREFIX}${id}.svg`,
}));

const BY_ID = new Map(DEFAULT_AVATARS.map((a) => [a.id, a]));
const URL_SET = new Set(DEFAULT_AVATARS.map((a) => a.url));

export function getDefaultAvatarById(id: string): DefaultAvatar | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

export function isDefaultAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return URL_SET.has(url);
}
