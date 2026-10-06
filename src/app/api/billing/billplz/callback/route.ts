import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/billplz";
import { markBillPaid } from "@/lib/invoice-billing";

// Billplz server-to-server callback after a payment attempt (form-encoded, X-Signature signed).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!verifySignature(params)) {
    console.error("[billplz] callback with invalid signature", params.id);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (params.paid === "true") await markBillPaid(params.id, Number(params.paid_amount));
  return new NextResponse("OK");
}
