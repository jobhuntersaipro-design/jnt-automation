/**
 * Validate image file content via magic bytes.
 * Returns the detected MIME type, or null if the file is not a recognized image.
 */
export function validateImageMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  // JPEG: starts with FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  // PNG: starts with 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  // WebP: bytes 8-11 are "WEBP"
  if (buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
