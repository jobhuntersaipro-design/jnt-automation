import { Resend } from "resend";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://easystaff.top";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
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
        Need help? Contact <a href="mailto:help@easystaff.top" style="color:#0056D2;text-decoration:none;">help@easystaff.top</a>
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

  await resend.emails.send({
    from: "EasyStaff <help@easystaff.top>",
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

  await resend.emails.send({
    from: "EasyStaff <help@easystaff.top>",
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
      "If you have any questions, contact help@easystaff.top",
    ].join("\n"),
  });
}
