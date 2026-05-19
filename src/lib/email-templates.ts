/**
 * Premium branded email templates for SkillBridge CRM
 * Logo hosted at https://crm.skillbridgeladder.in/logo.png
 * Sender: notifications@crm.skillbridgeladder.in (Resend verified domain)
 */

const LOGO_URL = "https://crm.skillbridgeladder.in/logo.png";
const CRM_URL = "https://crm.skillbridgeladder.in";
const BRAND_COLOR = "#7c3aed";
const BRAND_DARK = "#09090b";

function emailWrapper(content: string, preheader = "") {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>SkillBridge CRM</title>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;">${preheader}&nbsp;&zwnj;</div>` : ""}
</head>
<body style="margin:0;padding:0;background:${BRAND_DARK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_DARK};min-height:100vh;">
  <tr><td align="center" style="padding:40px 16px;">
    <!-- Email Card -->
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
      
      <!-- Header with Logo -->
      <tr><td style="padding:28px 36px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.3);">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td width="44" valign="middle">
            <img src="${LOGO_URL}" alt="SkillBridge" width="44" height="44" 
                 style="border-radius:10px;display:block;border:0;outline:none;"
                 onerror="this.style.display='none'"/>
          </td>
          <td style="padding-left:12px;" valign="middle">
            <div style="font-size:16px;font-weight:800;color:#fafafa;letter-spacing:-0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">SkillBridge CRM</div>
            <div style="font-size:11px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">crm.skillbridgeladder.in</div>
          </td>
          <td align="right" valign="middle">
            <a href="${CRM_URL}" style="font-size:11px;color:${BRAND_COLOR};text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Open CRM ↗</a>
          </td>
        </tr></table>
      </td></tr>

      <!-- Content -->
      <tr><td style="padding:36px;">
        ${content}
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:20px 36px 28px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(0,0,0,0.25);">
        <p style="margin:0 0 8px;font-size:12px;color:#52525b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          This is an automated notification from SkillBridge CRM ·
          <a href="${CRM_URL}" style="color:${BRAND_COLOR};text-decoration:none;">crm.skillbridgeladder.in</a>
        </p>
        <p style="margin:0;font-size:11px;color:#3f3f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          © ${new Date().getFullYear()} SkillBridge Ladder · All rights reserved
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ── Generic notification email ─────────────────────────────────────────────── */
export function buildNotificationEmail({
  toName, title, message, ctaText, ctaLink, type = "general",
}: {
  toName: string; title: string; message: string;
  ctaText: string; ctaLink: string; type?: string;
}) {
  const typeEmoji: Record<string, string> = {
    task_assigned: "📋", payment_released: "💰", review_feedback: "💬",
    task_approved: "✅", task_rejected: "❌", general: "🔔",
  };
  const emoji = typeEmoji[type] || "🔔";

  const content = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${emoji} Notification</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#fafafa;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${title}</h1>
    <p style="margin:0 0 8px;font-size:14px;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Hi <strong style="color:#e4e4e7;">${toName}</strong>,</p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${message}</p>
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:10px;background:${BRAND_COLOR};">
        <a href="${ctaLink}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.1px;">${ctaText} →</a>
      </td>
    </tr></table>
    <p style="margin:20px 0 0;font-size:12px;color:#52525b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      Or copy this link: <a href="${ctaLink}" style="color:${BRAND_COLOR};word-break:break-all;">${ctaLink}</a>
    </p>
  `;
  return emailWrapper(content, message.slice(0, 90));
}

/* ── Task assigned email ─────────────────────────────────────────────────────── */
export function buildTaskAssignedEmail({
  toName, taskTitle, channel, type, due, pay, taskLink, profileLink,
}: {
  toName: string; taskTitle: string; channel: string; type: string;
  due: string; pay: number; taskLink: string; profileLink?: string;
}) {
  const content = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">📋 New Task Assigned</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#fafafa;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${taskTitle}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Hi <strong style="color:#e4e4e7;">${toName}</strong>, a new task has been assigned to you.</p>
    
    <!-- Task Details Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:28px;">
      <tr>
        <td style="padding:20px 24px;">
          ${[
            ["Channel", channel],
            ["Type", type],
            ["Due", due || "As soon as possible"],
            ["Your Earnings", `₹${pay?.toLocaleString("en-IN") || "0"}`],
          ].map(([label, val]) => `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>
              <td width="120" style="font-size:12px;font-weight:600;color:#52525b;font-family:-apple-system,sans-serif;text-transform:uppercase;letter-spacing:0.06em;">${label}</td>
              <td style="font-size:13px;font-weight:600;color:#e4e4e7;font-family:-apple-system,sans-serif;">${val}</td>
            </tr></table>
          `).join("")}
        </td>
      </tr>
    </table>

    <!-- CTA Buttons -->
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:10px;background:${BRAND_COLOR};margin-right:10px;">
        <a href="${taskLink}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,sans-serif;">View My Tasks →</a>
      </td>
      ${profileLink ? `<td style="padding-left:10px;"><a href="${profileLink}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#a78bfa;text-decoration:none;border:1px solid rgba(124,58,237,0.3);border-radius:10px;font-family:-apple-system,sans-serif;">View Profile</a></td>` : ""}
    </tr></table>
  `;
  return emailWrapper(content, `New task: ${taskTitle} on ${channel}`);
}

/* ── Payment released email ──────────────────────────────────────────────────── */
export function buildPaymentEmail({
  toName, taskTitle, amount, earningsLink, profileLink,
}: {
  toName: string; taskTitle: string; amount: number; earningsLink: string; profileLink?: string;
}) {
  const content = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#10b981;font-family:-apple-system,sans-serif;">💰 Payment Released</p>
    <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;color:#fafafa;letter-spacing:-1px;font-family:-apple-system,sans-serif;">₹${amount.toLocaleString("en-IN")}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;font-family:-apple-system,sans-serif;">For: <strong style="color:#e4e4e7;">${taskTitle}</strong></p>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#a1a1aa;font-family:-apple-system,sans-serif;">
      Hi <strong style="color:#e4e4e7;">${toName}</strong>, your payment has been released. 
      Keep up the excellent work — consistent quality earns you more tasks and higher pay! 🎉
    </p>
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:10px;background:#10b981;">
        <a href="${earningsLink}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,sans-serif;">View My Earnings →</a>
      </td>
      ${profileLink ? `<td style="padding-left:10px;"><a href="${profileLink}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#a78bfa;text-decoration:none;border:1px solid rgba(124,58,237,0.3);border-radius:10px;font-family:-apple-system,sans-serif;">View Profile</a></td>` : ""}
    </tr></table>
  `;
  return emailWrapper(content, `₹${amount.toLocaleString("en-IN")} payment released for ${taskTitle}`);
}

/* ── New video / ticket created email ───────────────────────────────────────── */
export function buildNewVideoEmail({
  toName, videoTitle, channel, type, assignedEditors, tasksLink,
}: {
  toName: string; videoTitle: string; channel: string; type: string;
  assignedEditors: string[]; tasksLink: string;
}) {
  const content = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#3b82f6;font-family:-apple-system,sans-serif;">🎬 New Video Ticket</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#fafafa;letter-spacing:-0.5px;font-family:-apple-system,sans-serif;">${videoTitle}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;font-family:-apple-system,sans-serif;">Hi <strong style="color:#e4e4e7;">${toName}</strong>, a new video ticket has been created and assigned to your team.</p>
    
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:10px;margin-bottom:28px;">
      <tr><td style="padding:20px 24px;">
        ${[
          ["Channel", channel],
          ["Type", type],
          ["Assigned To", assignedEditors.join(", ") || "Unassigned"],
        ].map(([label, val]) => `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>
            <td width="120" style="font-size:12px;font-weight:600;color:#52525b;font-family:-apple-system,sans-serif;text-transform:uppercase;letter-spacing:0.06em;">${label}</td>
            <td style="font-size:13px;font-weight:600;color:#e4e4e7;font-family:-apple-system,sans-serif;">${val}</td>
          </tr></table>
        `).join("")}
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:10px;background:#3b82f6;">
        <a href="${tasksLink}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,sans-serif;">View All Tasks →</a>
      </td>
    </tr></table>
  `;
  return emailWrapper(content, `New video ticket: ${videoTitle} on ${channel}`);
}

/* ── Auth / Sign-in link email (Path A from guide) ──────────────────────────── */
export function buildSignInEmail({ toName, link }: { toName: string; link: string }) {
  const content = `
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_COLOR};font-family:-apple-system,sans-serif;">🔑 Sign-in Link</p>
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#fafafa;letter-spacing:-0.5px;font-family:-apple-system,sans-serif;">Access Your CRM</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#a1a1aa;font-family:-apple-system,sans-serif;">
      Hi <strong style="color:#e4e4e7;">${toName || "there"}</strong>, click the button below to securely sign in to your SkillBridge CRM account. This link expires in 15 minutes.
    </p>
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="border-radius:10px;background:${BRAND_COLOR};">
        <a href="${link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:-apple-system,sans-serif;">Sign In to Dashboard →</a>
      </td>
    </tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:#52525b;font-family:-apple-system,sans-serif;">If you didn't request this, you can safely ignore this email.</p>
  `;
  return emailWrapper(content, "Your secure sign-in link for SkillBridge CRM");
}

// Legacy export for backwards compatibility
export const generateNotificationEmail = (title: string, message: string, ctaText: string, ctaLink: string) =>
  buildNotificationEmail({ toName: "Team Member", title, message, ctaText, ctaLink });
