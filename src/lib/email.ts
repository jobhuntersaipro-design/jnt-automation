import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { SUPPORT_EMAIL } from "@/lib/support";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://easystaff.top";
// Sending address must be on the Resend-verified domain; replies go to support.
const FROM = process.env.EMAIL_FROM ?? "EasyStaff <onboarding@kim-brothers.com>";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

type SendPayload = Parameters<Resend["emails"]["send"]>[0];

/** Resend returns API errors (unverified domain, bad key) instead of throwing. */
async function send(resend: Resend, payload: SendPayload) {
  const { error } = await resend.emails.send({ replyTo: SUPPORT_EMAIL, ...payload });
  if (error) throw new Error(`Resend ${error.name}: ${error.message}`);
}

/**
 * Wraps email body content in a branded HTML template.
 */
function wrapInTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>EasyStaff</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#191c1d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px -12px rgba(25,28,29,0.08);">
  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0056D2,#003d96);padding:32px 40px 28px;">
      <h1 style="margin:0;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">EasyStaff</h1>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 40px 40px;">
      ${body}
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="padding:20px 40px 28px;border-top:1px solid #e7e8e9;">
      <p style="margin:0;font-size:12px;color:#424654;line-height:1.5;">
        &copy; ${new Date().getFullYear()} EasyStaff &middot; J&amp;T Express Salary Automation
      </p>
      <p style="margin:6px 0 0;font-size:12px;color:#424654;">
        Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#0056D2;text-decoration:none;">${SUPPORT_EMAIL}</a>
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Send password reset email with a one-time link. Uses the same branded
 * template as the approval mail so the user sees consistent EasyStaff
 * styling across all account-flow emails.
 */
export async function sendPasswordResetEmail(
  agentEmail: string,
  agentName: string,
  resetUrl: string,
) {
  const resend = getResend();
  if (!resend) return;

  const html = wrapInTemplate(`
      <h2 style="margin:0 0 8px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#191c1d;">
        Reset your password
      </h2>
      <p style="margin:0 0 24px;font-size:15px;color:#424654;line-height:1.6;">
        Hi ${agentName},
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#424654;line-height:1.6;">
        We received a request to reset the password on your EasyStaff account. Click the button below to choose a new one — the link expires in 1 hour.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#0056D2;border-radius:6px;">
            <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Reset password
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px;font-size:13px;color:#424654;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;">
        <a href="${resetUrl}" style="color:#0056D2;text-decoration:none;">${resetUrl}</a>
      </p>
      <p style="margin:0;padding:14px 16px;font-size:13px;color:#424654;line-height:1.5;background-color:#f3f4f5;border-left:3px solid #940002;border-radius:4px;">
        Didn't ask for this? You can safely ignore this email — your password will not change unless you click the link above.
      </p>
  `);

  await send(resend, {
    from: FROM,
    to: agentEmail,
    subject: "Reset your password — EasyStaff",
    html,
    text: [
      `Hi ${agentName},`,
      "",
      "We received a request to reset the password on your EasyStaff account.",
      "Click the link below to choose a new one — it expires in 1 hour.",
      "",
      resetUrl,
      "",
      "Didn't ask for this? You can safely ignore this email — your password will not change unless you click the link above.",
    ].join("\n"),
  });
}

/**
 * Send approval notification email to the agent.
 */
export async function sendApprovalEmail(agentEmail: string, agentName: string) {
  const resend = getResend();
  if (!resend) return;

  const loginUrl = `${APP_URL}/auth/login`;

  const html = wrapInTemplate(`
      <h2 style="margin:0 0 8px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#191c1d;">
        Your account has been approved
      </h2>
      <p style="margin:0 0 24px;font-size:15px;color:#424654;line-height:1.6;">
        Hi ${agentName},
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#424654;line-height:1.6;">
        Great news — your EasyStaff account has been reviewed and approved. You can now log in and start managing your dispatchers and payroll.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background-color:#0056D2;border-radius:6px;">
            <a href="${loginUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Log in to EasyStaff
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#424654;line-height:1.5;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="margin:4px 0 0;font-size:13px;word-break:break-all;">
        <a href="${loginUrl}" style="color:#0056D2;text-decoration:none;">${loginUrl}</a>
      </p>
  `);

  await send(resend, {
    from: FROM,
    to: agentEmail,
    subject: "Your EasyStaff account has been approved",
    html,
    text: [
      `Hi ${agentName},`,
      "",
      "Great news — your EasyStaff account has been reviewed and approved.",
      "You can now log in and start managing your dispatchers and payroll.",
      "",
      `Log in here: ${loginUrl}`,
      "",
      `If you have any questions, contact ${SUPPORT_EMAIL}`,
    ].join("\n"),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Who hears about new signups: `NOTIFY_EMAIL` (comma-separated allowed),
 * otherwise every superadmin on file.
 */
async function getSignupNotifyRecipients(): Promise<string[]> {
  const fromEnv = (process.env.NOTIFY_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  const admins = await prisma.agent.findMany({
    where: { isSuperAdmin: true },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

export type SignupMethod = "email" | "google";

/**
 * Tell the superadmin a new agent signed up (accounts are auto-approved).
 * Covers both email/password registration and first-time Google sign-in.
 * Never throws — a failed notification must not break signup.
 */
export async function sendNewSignupNotification(
  agentEmail: string,
  agentName: string,
  method: SignupMethod,
  phone?: string | null,
) {
  try {
    const resend = getResend();
    if (!resend) return;

    const to = await getSignupNotifyRecipients();
    if (to.length === 0) return;

    const adminUrl = `${APP_URL}/admin`;
    const methodLabel = method === "google" ? "Google" : "Email & password";
    const registeredAt = new Date().toISOString();
    const displayName = agentName || "(no name)";

    const row = (label: string, value: string) => `
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:13px;color:#424654;white-space:nowrap;">${label}</td>
          <td style="padding:6px 0;font-size:14px;color:#191c1d;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`;

    const html = wrapInTemplate(`
      <h2 style="margin:0 0 8px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#191c1d;">
        New signup
      </h2>
      <p style="margin:0 0 20px;font-size:15px;color:#424654;line-height:1.6;">
        A new agent has signed up for EasyStaff. Their account is approved automatically.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;padding:12px 16px;background-color:#f3f4f5;border-radius:6px;width:100%;">
        ${row("Name", displayName)}
        ${row("Email", agentEmail)}
        ${phone ? row("WhatsApp", phone) : ""}
        ${row("Signed up with", methodLabel)}
        ${row("Signed up at", registeredAt)}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr>
          <td style="background-color:#0056D2;border-radius:6px;">
            <a href="${adminUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              View in Admin
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#424654;line-height:1.5;">
        Or open <a href="${adminUrl}" style="color:#0056D2;text-decoration:none;">${adminUrl}</a>
      </p>
    `);

    await send(resend, {
      from: FROM,
      to,
      subject: `New signup — ${displayName} (${agentEmail})`,
      html,
      text: [
        "A new agent has signed up. Their account is approved automatically.",
        "",
        `Name: ${displayName}`,
        `Email: ${agentEmail}`,
        ...(phone ? [`WhatsApp: ${phone}`] : []),
        `Signed up with: ${methodLabel}`,
        `Signed up at: ${registeredAt}`,
        "",
        `View in Admin: ${adminUrl}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[email] new signup notification failed", err);
  }
}

function formatRMText(n: number): string {
  return n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Monthly subscription invoice with the PDF attached. Throws on failure. */
export async function sendInvoiceEmail(input: {
  to: string;
  name: string;
  year: number;
  month: number;
  amount: number;
  branchCount: number;
  invoiceNo: string;
  paid: boolean;
  pdf: Buffer;
  filename: string;
}) {
  const resend = getResend();
  if (!resend) throw new Error("RESEND_API_KEY is not set");

  const period = `${MONTH_NAMES[input.month - 1]} ${input.year}`;
  const amount = `RM ${formatRMText(input.amount)}`;
  const summary = input.paid
    ? `This is your receipt for ${period}. Payment of ${amount} has been received — thank you.`
    : `Your EasyStaff invoice for ${period} is ready. The amount due is ${amount} (${input.branchCount} branch${input.branchCount === 1 ? "" : "es"} × RM 150.00).`;

  const html = wrapInTemplate(`
      <h2 style="margin:0 0 8px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#191c1d;">
        ${input.paid ? "Payment received" : "Your invoice"} · ${period}
      </h2>
      <p style="margin:0 0 16px;font-size:15px;color:#424654;line-height:1.6;">Hi ${escapeHtml(input.name)},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#424654;line-height:1.6;">${summary}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#424654;">Invoice no: <strong style="color:#191c1d;">${input.invoiceNo}</strong></p>
      <p style="margin:0 0 24px;font-size:13px;color:#424654;">The invoice is attached as a PDF, with payment details inside.</p>
  `);

  await send(resend, {
    from: FROM,
    to: input.to,
    subject: `${input.paid ? "Receipt" : "Invoice"} ${input.invoiceNo} — EasyStaff ${period}`,
    html,
    text: [
      `Hi ${input.name},`,
      "",
      summary,
      `Invoice no: ${input.invoiceNo}`,
      "",
      "The invoice is attached as a PDF, with payment details inside.",
    ].join("\n"),
    attachments: [{ filename: input.filename, content: input.pdf }],
  });
}

/** Tell the superadmin an agent changed their own branch limit. Never throws. */
export async function sendPlanChangeNotification(
  agentEmail: string,
  agentName: string,
  from: number,
  to: number,
) {
  try {
    const resend = getResend();
    if (!resend) return;
    const recipients = await getSignupNotifyRecipients();
    if (recipients.length === 0) return;

    const direction = to > from ? "increased" : "reduced";
    const monthly = `RM ${formatRMText(to * 150)}`;
    const adminUrl = `${APP_URL}/admin`;
    const html = wrapInTemplate(`
      <h2 style="margin:0 0 8px;font-family:'Manrope','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;color:#191c1d;">
        Branch limit ${direction}
      </h2>
      <p style="margin:0 0 20px;font-size:15px;color:#424654;line-height:1.6;">
        <strong style="color:#191c1d;">${escapeHtml(agentName || agentEmail)}</strong> (${escapeHtml(agentEmail)})
        changed their branch limit from <strong>${from}</strong> to <strong>${to}</strong>.
        Their plan is now ${monthly}/month.
      </p>
      <a href="${adminUrl}" style="color:#0056D2;text-decoration:none;font-size:14px;">Open Admin</a>
    `);
    await send(resend, {
      from: FROM,
      to: recipients,
      subject: `Branch limit ${direction}: ${agentName || agentEmail} (${from} → ${to})`,
      html,
      text: `${agentName || agentEmail} (${agentEmail}) changed their branch limit from ${from} to ${to}. Plan is now ${monthly}/month.\n\n${adminUrl}`,
    });
  } catch (err) {
    console.error("[email] plan change notification failed", err);
  }
}
