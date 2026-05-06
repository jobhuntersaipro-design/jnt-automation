/**
 * Format a Malaysian MyKad IC number for display.
 *
 * 12-digit IC → "YYMMDD-PB-####" (e.g. "900101101234" → "900101-10-1234").
 * Anything else (empty, partial, malformed) is returned untouched so the
 * caller can decide how to render incomplete state.
 */
export function formatIc(icNo: string | null | undefined): string {
  if (!icNo) return "";
  if (!/^\d{12}$/.test(icNo)) return icNo;
  return icNo.replace(/^(\d{6})(\d{2})(\d{4})$/, "$1-$2-$3");
}

/**
 * Live-format an IC input value as the user types: progressive 6-2-4 grouping.
 *
 * Examples:
 *   ""           → ""
 *   "1234"       → "1234"
 *   "123456"     → "123456"
 *   "1234567"    → "123456-7"
 *   "12345678"   → "123456-78"
 *   "123456789"  → "123456-78-9"
 *   "123456789012" → "123456-78-9012"
 *
 * Strips non-digits and clamps to 12 digits. Use as the displayed `value` of
 * an IC `<input>`, while the underlying state stores the raw digits.
 */
export function formatIcInput(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}
