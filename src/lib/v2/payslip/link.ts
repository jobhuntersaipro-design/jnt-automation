import { createHmac, timingSafeEqual } from "node:crypto";

// A payslip link a dispatcher can open without an account: the result id plus a signature, so links
// can't be guessed or edited to reach someone else's payslip. Only finalised runs are shown.

const sign = (id: string, secret: string) => createHmac("sha256", secret).update(`payslip:${id}`).digest("base64url").slice(0, 32);

export function payslipToken(resultId: string, secret = process.env.AUTH_SECRET ?? ""): string {
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return `${resultId}.${sign(resultId, secret)}`;
}

/** The result id a token stands for, or null when it was changed or made up. */
export function readPayslipToken(token: string, secret = process.env.AUTH_SECRET ?? ""): string | null {
  const [id, mac, extra] = token.split(".");
  if (!secret || !id || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}
