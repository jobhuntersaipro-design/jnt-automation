/**
 * Minimal Billplz v3 client (https://support.billplz.com/api): create and
 * delete bills, and verify the X-Signature on callbacks.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE_URL =
  process.env.BILLPLZ_SANDBOX === "true"
    ? "https://www.billplz-sandbox.com/api/v3"
    : "https://www.billplz.com/api/v3";

export const APP_URL = process.env.NEXTAUTH_URL ?? "https://easystaff.top";

export function billplzConfigured(): boolean {
  return Boolean(process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID && process.env.BILLPLZ_X_SIGNATURE);
}

async function call(path: string, init: RequestInit) {
  const auth = Buffer.from(`${process.env.BILLPLZ_API_KEY}:`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message;
    throw new Error(`Billplz ${res.status}: ${Array.isArray(message) ? message.join(", ") : message ?? "request failed"}`);
  }
  return body;
}

export async function createBill(input: {
  email: string;
  name: string;
  amount: number; // RM
  description: string;
  reference: string;
}): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams({
    collection_id: process.env.BILLPLZ_COLLECTION_ID ?? "",
    email: input.email,
    name: input.name.slice(0, 255),
    amount: String(Math.round(input.amount * 100)),
    description: input.description.slice(0, 200),
    callback_url: `${APP_URL}/api/billing/billplz/callback`,
    redirect_url: `${APP_URL}/settings`,
    reference_1_label: "Invoice",
    reference_1: input.reference.slice(0, 120),
  });
  const bill = await call("/bills", { method: "POST", body: form });
  return { id: bill.id, url: bill.url };
}

/** Only unpaid bills can be deleted; Billplz rejects the rest. */
export async function deleteBill(id: string) {
  await call(`/bills/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Billplz source string: every "key+value" except x_signature, sorted case-insensitively, joined by "|". */
export function signatureSource(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([k]) => k !== "x_signature")
    .map(([k, v]) => `${k}${v}`)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0))
    .join("|");
}

export function signParams(params: Record<string, string>, key: string): string {
  return createHmac("sha256", key).update(signatureSource(params)).digest("hex");
}

export function verifySignature(params: Record<string, string>, key = process.env.BILLPLZ_X_SIGNATURE ?? ""): boolean {
  if (!key || !params.x_signature) return false;
  const expected = Buffer.from(signParams(params, key));
  const given = Buffer.from(params.x_signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
