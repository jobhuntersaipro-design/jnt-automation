/**
 * Pre-bundled default avatars (DiceBear Avataaars).
 * SVG files are served statically from /public/avatars/defaults/.
 */

export const DEFAULT_AVATAR_URL_PREFIX = "/avatars/defaults/";

export interface DefaultAvatar {
  id: string;
  url: string;
}

const DEFAULT_AVATAR_IDS = [
  "avataaars-01",
  "avataaars-02",
  "avataaars-03",
  "avataaars-04",
  "avataaars-05",
  "avataaars-06",
  "avataaars-07",
  "avataaars-08",
  "avataaars-09",
  "avataaars-10",
  "avataaars-11",
  "avataaars-12",
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
