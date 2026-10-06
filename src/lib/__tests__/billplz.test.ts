import { describe, it, expect } from "vitest";
import { signParams, signatureSource, verifySignature } from "@/lib/billplz";

// Callback example from https://support.billplz.com/api (X Signature section)
const callback = {
  id: "zq0tm2wc",
  collection_id: "yhx5t1pp",
  paid: "true",
  state: "paid",
  amount: "100",
  paid_amount: "100",
  due_at: "2018-9-27",
  email: "tester@test.com",
  mobile: "",
  name: "TESTER",
  url: "http://www.billplz-sandbox.com/bills/zq0tm2wc",
  paid_at: "2018-09-27 15:15:09 +0800",
};

describe("billplz signature", () => {
  it("builds the documented source string", () => {
    expect(signatureSource({ ...callback, x_signature: "ignored" })).toBe(
      "amount100|collection_idyhx5t1pp|due_at2018-9-27|emailtester@test.com|idzq0tm2wc|mobile|nameTESTER|paid_amount100|paid_at2018-09-27 15:15:09 +0800|paidtrue|statepaid|urlhttp://www.billplz-sandbox.com/bills/zq0tm2wc",
    );
  });

  it("accepts a correctly signed callback and rejects tampering", () => {
    const signed = { ...callback, x_signature: signParams(callback, "secret") };
    expect(verifySignature(signed, "secret")).toBe(true);
    expect(verifySignature({ ...signed, paid_amount: "1" }, "secret")).toBe(false);
    expect(verifySignature(signed, "other")).toBe(false);
    expect(verifySignature(callback, "secret")).toBe(false);
  });
});
