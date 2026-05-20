export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const CF_WORKER = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and verification code are required" }, { status: 400 });
    }

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; max-width:500px; margin:0 auto; padding:40px 20px; background:#09090b; color:#fafafa; border-radius:12px; border:1px solid #27272a;">
        <div style="text-align:center; margin-bottom:32px;">
          <h2 style="font-size:24px; font-weight:800; color:#fafafa; margin:0; background:linear-gradient(90deg, #a78bfa, #60a5fa); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">SkillBridge CRM</h2>
          <p style="font-size:12px; color:#71717a; margin:4px 0 0; text-transform:uppercase; letter-spacing:0.05em;">Email Verification OTP</p>
        </div>
        
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:24px; text-align:center;">
          <h3 style="font-size:18px; font-weight:700; color:#fafafa; margin:0 0 12px;">Verify your email address</h3>
          <p style="font-size:14px; color:#a1a1aa; line-height:1.6; margin:0 0 20px;">
            Thank you for registering with SkillBridge CRM. To activate your account and access your workspace, please enter the following one-time verification code (OTP) in the verification screen:
          </p>
          <div style="font-size:32px; font-weight:800; letter-spacing:6px; color:#a78bfa; background:#27272a; padding:12px 24px; border-radius:8px; display:inline-block; margin:20px 0;">
            ${code}
          </div>
          <p style="font-size:12px; color:#71717a; line-height:1.5; margin:20px 0 0;">
            This code will expire in 1 hour. If you did not sign up for SkillBridge CRM, please ignore this email.
          </p>
        </div>
        
        <div style="text-align:center; font-size:11px; color:#71717a; border-top:1px solid #27272a; padding-top:20px; margin-top:20px;">
          This is an automated security message from SkillBridge CRM.
        </div>
      </div>
    `;

    // Send email via Cloudflare Worker -> Resend
    const res = await fetch(`${CF_WORKER}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `SkillBridge CRM Verification Code: ${code}`,
        html,
        replyTo: "hr@skillbridgeladder.in"
      })
    });

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[/api/auth/send-verification] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
