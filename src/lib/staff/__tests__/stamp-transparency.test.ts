import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeStampBackgroundTransparent } from "../stamp-transparency";

/** Build a small RGB JPEG with a white background and one red dot in the
 *  center. The helper should knock out the white and preserve the dot. */
async function makeTestJpeg(): Promise<Buffer> {
  const w = 8;
  const h = 8;
  const raw = Buffer.alloc(w * h * 3, 255); // start fully white (RGB)
  // Plant a red pixel at (3,3) and (4,4) — these should survive.
  for (const [px, py] of [
    [3, 3],
    [4, 4],
  ] as const) {
    const idx = (py * w + px) * 3;
    raw[idx] = 220;     // R
    raw[idx + 1] = 30;  // G
    raw[idx + 2] = 30;  // B
  }
  return await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe("makeStampBackgroundTransparent", () => {
  it("returns a valid PNG buffer", async () => {
    const jpg = await makeTestJpeg();
    const out = await makeStampBackgroundTransparent(jpg);
    // PNG signature: 0x89 0x50 0x4E 0x47
    expect(out[0]).toBe(0x89);
    expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("makes white background pixels fully transparent", async () => {
    const jpg = await makeTestJpeg();
    const png = await makeStampBackgroundTransparent(jpg);

    // Decode result and inspect alpha at a known-white corner pixel.
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);

    const cornerIdx = 0; // pixel (0,0) was white in the source
    expect(data[cornerIdx + 3]).toBe(0);
  });

  it("preserves dark/coloured pixels with non-zero alpha", async () => {
    const jpg = await makeTestJpeg();
    const png = await makeStampBackgroundTransparent(jpg);
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Pixel (3,3) was the red dot. It should still be visible (alpha > 0).
    const dotIdx = (3 * info.width + 3) * 4;
    expect(data[dotIdx + 3]).toBeGreaterThan(0);
    // And it should still be reddish (R higher than G or B).
    expect(data[dotIdx]).toBeGreaterThan(data[dotIdx + 1]);
    expect(data[dotIdx]).toBeGreaterThan(data[dotIdx + 2]);
  });

  it("handles a transparent PNG input idempotently (no crash, still valid PNG)", async () => {
    // RGBA input where some pixels are already transparent — the helper
    // shouldn't choke on the existing alpha channel.
    const w = 4;
    const h = 4;
    const raw = Buffer.alloc(w * h * 4, 0); // fully transparent
    // Plant an opaque dark pixel at (1,1)
    const idx = (1 * w + 1) * 4;
    raw[idx] = 20;
    raw[idx + 1] = 20;
    raw[idx + 2] = 20;
    raw[idx + 3] = 255;
    const inputPng = await sharp(raw, {
      raw: { width: w, height: h, channels: 4 },
    })
      .png()
      .toBuffer();

    const out = await makeStampBackgroundTransparent(inputPng);
    expect(out[0]).toBe(0x89);
    expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
