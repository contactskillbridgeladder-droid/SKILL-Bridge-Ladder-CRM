export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import { buildNotificationEmail, buildTaskAssignedEmail, buildPaymentEmail, buildNewVideoEmail } from "@/lib/email-templates";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CF_WORKER = process.env.NEXT_PUBLIC_CF_WORKER_URL!;

async function getAccessToken(): Promise<string> {
  const { getGoogleAuthCredentials } = await import("@/lib/firebase-admin");
  const { GoogleAuth } = await import("google-auth-library");
  const key = getGoogleAuthCredentials();
  const auth = new GoogleAuth({ credentials: key, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  return t.token!;
}

// Write Firestore notification document via REST (bypasses gRPC issues)
async function writeFirestoreNotif(token: string, toUid: string, payload: Record<string, string>) {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await fetch(`${FIRESTORE_URL}/users/${toUid}/notifications/${notifId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        id:        { stringValue: notifId },
        type:      { stringValue: payload.type },
        title:     { stringValue: payload.title },
        message:   { stringValue: payload.message },
        ctaLink:   { stringValue: payload.ctaLink },
        read:      { booleanValue: false },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  return notifId;
}

// Send FCM push notification to a specific FCM token via REST
async function sendFCMPush(token: string, fcmToken: string, payload: { title: string; body: string; url?: string }) {
  if (!fcmToken) return;
  await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title: payload.title, body: payload.body },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: "/logo.png",
            badge: "/logo.png",
            data: { url: payload.url || "https://crm.skillbridgeladder.in" },
          },
          fcm_options: { link: payload.url || "https://crm.skillbridgeladder.in" },
        },
      },
    }),
  });
}

// Fetch user's FCM token from Firestore
async function getUserFCMToken(token: string, uid: string): Promise<string | null> {
  const res = await fetch(`${FIRESTORE_URL}/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields?.fcmToken?.stringValue || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      toUid, toEmail, toName, subject, title, message, type = "general",
      ctaText = "Open CRM", ctaLink = "https://crm.skillbridgeladder.in",
      // Typed email fields
      taskTitle, channel, taskType, due, pay, profileLink, amount, assignedEditors,
      // Multi-recipient
      recipients, // array of { uid, email, name } for broadcasting
    } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "Missing required fields: title, message" }, { status: 400 });
    }

    const token = await getAccessToken();
    const results: any[] = [];

    // Resolve recipient list — supports single or broadcast
    const recipientList: { uid: string; email: string; name: string }[] =
      recipients || (toUid ? [{ uid: toUid, email: toEmail, name: toName }] : []);

    if (recipientList.length === 0) {
      return NextResponse.json({ error: "No recipients — provide toUid or recipients[]" }, { status: 400 });
    }

    for (const recipient of recipientList) {
      const { uid, email, name } = recipient;

      // 1. In-app Firestore notification
      const notifId = await writeFirestoreNotif(token, uid, { type, title, message, ctaLink });

      // 2. FCM push notification (if user has registered a token)
      const fcmToken = await getUserFCMToken(token, uid);
      if (fcmToken) {
        await sendFCMPush(token, fcmToken, { title, body: message, url: ctaLink });
      }

      // 3. Build typed email HTML
      let html: string;
      if (type === "task_assigned" && taskTitle) {
        html = buildTaskAssignedEmail({
          toName: name || email, taskTitle, channel: channel || "", type: taskType || "Main Edit",
          due: due || "", pay: pay || 0, taskLink: ctaLink, profileLink,
        });
      } else if (type === "payment_released" && amount) {
        html = buildPaymentEmail({
          toName: name || email, taskTitle: taskTitle || title, amount,
          earningsLink: ctaLink, profileLink,
        });
      } else if (type === "new_video" && taskTitle) {
        html = buildNewVideoEmail({
          toName: name || email, videoTitle: taskTitle, channel: channel || "",
          type: taskType || "Main Edit", assignedEditors: assignedEditors || [],
          tasksLink: ctaLink,
        });
      } else {
        html = buildNotificationEmail({ toName: name || email, title, message, ctaText, ctaLink, type });
      }

      // 4. Send email via Cloudflare Worker → Resend
      const emailRes = await fetch(`${CF_WORKER}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: subject || title,
          html,
          replyTo: "hr@skillbridgeladder.in",
        }),
      });
      const emailData = await emailRes.json();
      results.push({ uid, notifId, email: emailData });
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("[/api/notify] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
