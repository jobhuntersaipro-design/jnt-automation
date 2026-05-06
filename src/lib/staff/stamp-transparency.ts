/**
 * Make the white background of an uploaded company stamp transparent.
 *
 * Why: payslips render the stamp on top of an "APPROVED BY" signature line.
 * If the source image is a JPG (no alpha channel) or a PNG saved with a
 * white background, a hard rectangle of white covers the dotted signature
 * line and looks unprofessional. Stamps are usually red or blue ink on
 * paper, so anything close to pure white is safe to drop.
 *
 * The conversion is one-shot at upload time so we don't pay the CPU cost
 * for every payslip render. The processed PNG is what's stored on R2 and
 * fetched verbatim by the PDF generator.
 *
 * Algorithm: ensure RGBA, decode to raw bytes, scan each pixel —
 *   - luminance ≥ FULL_TRANSPARENT_AT  → alpha = 0
 *   - luminance ∈ [SOFT_EDGE_FROM, FULL_TRANSPARENT_AT) → soften to anti-alias
 *     so the cutout has a clean edge instead of a sawtooth pattern
 *   - luminance < SOFT_EDGE_FROM → keep the original alpha (covers the ink)
 * Re-encode as PNG to preserve the alpha channel.
 */
import sharp from "sharp";

// Tuned for typical scanned/photographed stamps: ink usually has a luminance
// well below 200, while paper/scanner-bed background is 245+.
const FULL_TRANSPARENT_AT = 235;
const SOFT_EDGE_FROM = 205;
// Standard Rec. 709 luminance coefficients — perceptually accurate for a
// "how white is this pixel" measure. Using simple R+G+B average produces
// noticeably worse edges around colored ink (red stamps in particular).
const R_WEIGHT = 0.2126;
const G_WEIGHT = 0.7152;
const B_WEIGHT = 0.0722;

export async function makeStampBackgroundTransparent(input: Buffer): Promise<Buffer> {
  // ensureAlpha() guarantees a 4-channel buffer regardless of source format
  // (JPG → RGBA, palettised PNG → RGBA, etc).
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { data, info } = decoded;
  const { width, height, channels } = info;

  // sharp().ensureAlpha() always yields 4 channels. Defensive bail-out so a
  // malformed image doesn't silently produce garbage.
  if (channels !== 4) return input;

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const luminance = R_WEIGHT * r + G_WEIGHT * g + B_WEIGHT * b;

    if (luminance >= FULL_TRANSPARENT_AT) {
      out[i + 3] = 0;
    } else if (luminance > SOFT_EDGE_FROM) {
      // Linearly fade alpha from full at SOFT_EDGE_FROM down to 0 at
      // FULL_TRANSPARENT_AT. Keeps anti-aliased ink edges from looking
      // pixelated against a coloured PDF background.
      const span = FULL_TRANSPARENT_AT - SOFT_EDGE_FROM;
      const fade = (FULL_TRANSPARENT_AT - luminance) / span;
      out[i + 3] = Math.round(out[i + 3] * fade);
    }
    // luminance ≤ SOFT_EDGE_FROM → leave alpha untouched.
  }

  return await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
