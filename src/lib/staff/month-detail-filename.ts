/**
 * Build the download filename for a dispatcher's month detail file.
 *
 * Format: `{YYYY}_{MM}_{Name-with-dashes}.{ext}`
 * Example: `2026_02_ABDUL-HAFIZ-BIN-YUSOF.csv`
 *
 * - Spaces inside the name are replaced with `-`.
 * - Filesystem-unsafe characters (`/ \ : * ? " < > |`) are stripped.
 * - Other whitespace (tabs, newlines) is normalised to `-`.
 * - The caller supplies the extension (without leading dot).
 */
export function monthDetailFilename(
  year: number,
  month: number,
  name: string,
  ext: "csv" | "pdf",
): string {
  const mm = String(month).padStart(2, "0");
  const safe = name
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "")  // strip filesystem-unsafe chars
    .replace(/\s+/g, "-");          // whitespace → dash
  return `${year}_${mm}_${safe}.${ext}`;
}
