import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const send = vi.fn();
const findMany = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send } };
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { agent: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { sendNewSignupNotification, sendWelcomeEmail } from "@/lib/email";

describe("sendNewSignupNotification", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ data: { id: "msg_1" }, error: null });
    findMany.mockReset().mockResolvedValue([]);
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.NOTIFY_EMAIL;
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFY_EMAIL;
  });

  it("emails NOTIFY_EMAIL recipients (comma-separated)", async () => {
    process.env.NOTIFY_EMAIL = "a@x.com, b@x.com";
    await sendNewSignupNotification("new@agent.com", "Ali", "email");

    expect(findMany).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toEqual(["a@x.com", "b@x.com"]);
    expect(arg.from).toBe("EasyStaff <onboarding@kim-brothers.com>");
    expect(arg.replyTo).toBe("jobhunters.ai.pro@gmail.com");
    expect(arg.subject).toContain("new@agent.com");
    expect(arg.text).toContain("Signed up with: Email & password");
    expect(arg.text).toContain("/admin");
  });

  it("falls back to superadmin emails when NOTIFY_EMAIL is unset", async () => {
    findMany.mockResolvedValue([{ email: "boss@x.com" }]);
    await sendNewSignupNotification("g@agent.com", "Siti", "google");

    expect(send.mock.calls[0][0].to).toEqual(["boss@x.com"]);
    expect(send.mock.calls[0][0].text).toContain("Signed up with: Google");
  });

  it("escapes user-supplied names in the HTML body", async () => {
    process.env.NOTIFY_EMAIL = "a@x.com";
    await sendNewSignupNotification("x@y.com", "<script>alert(1)</script>", "email");

    const html: string = send.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("skips silently without a Resend key or recipients", async () => {
    delete process.env.RESEND_API_KEY;
    await sendNewSignupNotification("x@y.com", "A", "email");
    expect(send).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = "re_test";
    await sendNewSignupNotification("x@y.com", "A", "email");
    expect(send).not.toHaveBeenCalled();
  });

  it("logs Resend's returned error (it doesn't throw on API errors)", async () => {
    process.env.NOTIFY_EMAIL = "a@x.com";
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "domain is not verified" },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendNewSignupNotification("x@y.com", "A", "email");
    expect(String(err.mock.calls[0][1])).toContain("domain is not verified");
    err.mockRestore();
  });

  it("never throws when sending fails", async () => {
    process.env.NOTIFY_EMAIL = "a@x.com";
    send.mockRejectedValue(new Error("resend down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendNewSignupNotification("x@y.com", "A", "email"),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("sendWelcomeEmail", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ data: { id: "msg_1" }, error: null });
    process.env.RESEND_API_KEY = "re_test";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("emails the new agent with their trial end date and help address", async () => {
    await sendWelcomeEmail("new@agent.com", "Ahmad Bin Ali", new Date("2026-10-06T04:00:00Z"));

    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("new@agent.com");
    expect(arg.replyTo).toBe("jobhunters.ai.pro@gmail.com");
    expect(arg.subject).toContain("5 November 2026");
    expect(arg.html).toContain("Welcome to EasyStaff, Ahmad!");
    expect(arg.text).toContain("RM 150 per branch per month");
    expect(arg.text).toContain("jobhunters.ai.pro@gmail.com");
  });

  it("escapes the name and falls back when it's empty", async () => {
    await sendWelcomeEmail("x@y.com", "<b>Hi</b>");
    expect(send.mock.calls[0][0].html).toContain("&lt;b&gt;Hi&lt;/b&gt;");

    await sendWelcomeEmail("x@y.com", "");
    expect(send.mock.calls[1][0].html).toContain("Welcome to EasyStaff, there!");
  });

  it("never throws when sending fails", async () => {
    send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "nope" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendWelcomeEmail("x@y.com", "A")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
