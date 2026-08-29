// Nodemailer SMTP transport for sending transactional emails.
// Configured via SMTP_EMAIL and SMTP_APP_PASSWORD in .env.local.
//
// In demo mode (no credentials) sendEmail returns false and logs a warning —
// callers must never expose the code to the browser in that case.
//
// Gmail setup: enable 2-Step Verification → Google Account → Security → App Passwords.
// Generate one for "Mail" and paste it into SMTP_APP_PASSWORD.

import nodemailer from 'nodemailer';

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (transport) return transport;

  const email = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_APP_PASSWORD;

  if (!email || !password) return null;

  transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  });

  return transport;
}

/**
 * Sends an HTML email. Returns true on success, false when SMTP is not configured.
 * Throws on genuine delivery failure so callers can surface the error.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const t = getTransport();

  if (!t) {
    // Demo / no credentials — log the code to the server console so dev can still test
    console.warn('[mailer] SMTP not configured. Email to', to, 'was NOT sent.');
    console.warn('[mailer] Subject:', subject);
    return false;
  }

  await t.sendMail({
    from: `"SabaqAI" <${process.env.SMTP_EMAIL}>`,
    to,
    subject,
    html,
  });

  return true;
}

/** Shared layout for the two OTP-style transactional emails below — signup verification
 *  and password reset. Both are single-use 6-digit codes sent through this same pipeline;
 *  only the heading/body copy and expiry wording differ. */
function otpEmailShell(opts: { title: string; heading: string; body: string; code: string; expiryText: string; footer: string }): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#185C43 0%,#237A57 55%,#2A8C82 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">
                Sabaq<span style="color:#a7f3d0;">AI</span>
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">
                Your syllabus-grounded tutor
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#1a2e22;font-size:22px;font-weight:700;">
                ${opts.heading}
              </h2>
              <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${opts.body} The code expires in <strong>${opts.expiryText}</strong>.
              </p>

              <!-- OTP Code Box -->
              <div style="background:#f0fdf4;border:2px solid #a7f3d0;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#185C43;font-family:'Courier New',monospace;">
                  ${opts.code}
                </span>
              </div>

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
                ${opts.footer}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} SabaqAI · Pakistani Board Exam Preparation
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/** Builds the branded signup-verification OTP email body. */
export function buildOtpEmail(code: string): string {
  return otpEmailShell({
    title: 'Verify your SabaqAI account',
    heading: 'Verify your email',
    body: 'Use the 6-digit code below to complete your registration.',
    code,
    expiryText: '2 minutes',
    footer:
      'If you did not request this code, you can safely ignore this email. Someone may have entered your address by mistake.',
  });
}

/** Builds the branded password-reset OTP email body. Deliberately sent through our own
 *  Nodemailer pipeline, not supabase.auth.resetPasswordForEmail() — Supabase's built-in
 *  mailer has its own separate, low rate limit ("email rate limit exceeded") that has
 *  nothing to do with this SMTP account and can't be raised from application code. */
export function buildPasswordResetEmail(code: string): string {
  return otpEmailShell({
    title: 'Reset your SabaqAI password',
    heading: 'Reset your password',
    body: 'Use the 6-digit code below to choose a new password.',
    code,
    expiryText: '2 minutes',
    footer:
      'If you did not request a password reset, you can safely ignore this email — your password will not change.',
  });
}
