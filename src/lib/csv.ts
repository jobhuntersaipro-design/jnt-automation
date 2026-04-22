/**
 * RFC 4180 CSV field escape. Wraps values containing commas, quotes, or
 * line breaks in double-quotes and doubles any embedded quotes.
 */
export function escapeCsv(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
