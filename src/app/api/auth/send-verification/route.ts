export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

const CF_WORKER = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const auth = getAdminAuth();
    // Generate the standard Firebase email verification link
    const actionCodeSettings = {
      url: "https://crm.skillbridgeladder.in/login",
      handleCodeInApp: false, // False means handle on the default Google page first
    };
    const link = await auth.generateEmailVerificationLink(email, actionCodeSettings);

    // Build a beautiful HTML template matching our brand
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; max-width:600px; margin:0 auto; padding:40px 20px; background:#09090b; color:#fafafa; border-radius:12px; border:1px solid #27272a;">
        <div style="text-align:center; margin-bottom:32px;">
          <h2 style="font-size:24px; font-weight:800; color:#fafafa; margin:0; background:linear-gradient(90deg, #a78bfa, #60a5fa); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">SkillBridge CRM</h2>
          <p style="font-size:12px; color:#71717a; margin:4px 0 0; text-transform:uppercase; letter-spacing:0.05em;">Secure Verification System</p>
        </div>
        
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:24px; margin-bottom:24px;">
          <h3 style="font-size:18px; font-weight:700; color:#fafafa; margin:0 0 12px;">Verify your email address</h3>
          <p style="font-size:14px; color:#a1a1aa; line-height:1.6; margin:0 0 20px;">
            Thank you for registering with SkillBridge CRM. To activate your account and access your workspace, please verify your email address by clicking the button below:
          </p>
          <div style="text-align:center; margin:28px 0;">
            <a href="${link}" style="display:inline-block; background:#7c3aed; color:#ffffff; font-weight:600; font-size:14px; text-decoration:none; padding:12px 28px; border-radius:8px; box-shadow:0 4px 12px rgba(124,58,237,0.3); transition:background 0.2s;">
              Verify Email Address
            </a>
          </div>
          <p style="font-size:12px; color:#71717a; line-height:1.5; margin:20px 0 0;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${link}" style="color:#a78bfa; word-break:break-all;">${link}</a>
          </p>
        </div>
        
        <div style="text-align:center; font-size:11px; color:#71717a; border-top:1px solid #27272a; padding-top:20px;">
          This link will expire in 1 hour. If you did not sign up for SkillBridge CRM, please ignore this email.
        </div>
      </div>
    `;

    // Send email via Cloudflare Worker -> Resend
    const res = await fetch(`${CF_WORKER}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "Verify your email for SkillBridge CRM",
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
