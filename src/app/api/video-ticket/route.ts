export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";
import {
  buildNewVideoEmail,
  buildTaskAssignedEmail,
} from "@/lib/email-templates";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const CF_WORKER = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

async function getAccessToken(): Promise<string> {
  const { GoogleAuth } = await import("google-auth-library");
  const keyPath = path.resolve(process.cwd(), "skillbridge-crm-firebase-adminsdk-fbsvc-3d64026130.json");
  const key = JSON.parse(readFileSync(keyPath, "utf-8"));
  const auth = new GoogleAuth({
    credentials: key,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/firebase.messaging",
    ],
  });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  return t.token!;
}

async function fsGet(token: string, docPath: string) {
  const res = await fetch(`${FIRESTORE_URL}/${docPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fsPatch(token: string, docPath: string, fields: Record<string, any>) {
  return fetch(`${FIRESTORE_URL}/${docPath}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
}

// Write in-app notification document
async function writeNotif(token: string, uid: string, payload: {
  type: string; title: string; message: string; ctaLink: string;
}) {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await fsPatch(token, `users/${uid}/notifications/${notifId}`, {
    id:        { stringValue: notifId },
    type:      { stringValue: payload.type },
    title:     { stringValue: payload.title },
    message:   { stringValue: payload.message },
    ctaLink:   { stringValue: payload.ctaLink },
    read:      { booleanValue: false },
    createdAt: { timestampValue: new Date().toISOString() },
  });
  return notifId;
}

// Send FCM push to user's registered PWA/app token
async function sendFCMPush(token: string, fcmToken: string, payload: {
  title: string; body: string; url: string;
}) {
  if (!fcmToken) return;
  const res = await fetch(FCM_URL, {
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
            icon: "https://crm.skillbridgeladder.in/logo.png",
            badge: "https://crm.skillbridgeladder.in/logo.png",
            requireInteraction: false,
            vibrate: [200, 100, 200],
            tag: "skillbridge-notification",
            renotify: true,
          },
          fcm_options: { link: payload.url },
        },
        android: {
          notification: {
            icon: "logo",
            color: "#7c3aed",
            click_action: payload.url,
          },
        },
      },
    }),
  });
  const result = await res.json();
  if (!res.ok) console.warn("[FCM] Push failed:", result);
  return result;
}

// Send branded email via CF Worker → Resend
async function sendEmail(to: string, subject: string, html: string) {
  if (!to) return;
  const res = await fetch(`${CF_WORKER}/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, replyTo: "hr@skillbridgeladder.in" }),
  });
  return res.json();
}

/**
 * POST /api/video-ticket
 *
 * When a new video task is created:
 * 1. Writes the task to Firestore
 * 2. Notifies Head Editor (in-app + FCM push to installed PWA + branded email)
 * 3. Notifies all subordinate editors under that Head Editor (same 3-channel delivery)
 * 4. Notifies the directly assigned editor if different
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      channelId, videoTitle, youtubeUrl = "", type = "Main Edit",
      notes = "", due = "", adminPrice = 0, editorPay = 0, headPay = 0,
      headEditorUid, editorUid,
    } = body;

    if (!channelId || !videoTitle) {
      return NextResponse.json({ error: "channelId and videoTitle are required" }, { status: 400 });
    }

    const token = await getAccessToken();

    // ── 1. Fetch channel info ─────────────────────────────────────────────────
    const channelDoc = await fsGet(token, `channels/${channelId}`);
    const channelHandle = channelDoc?.fields?.handle?.stringValue || channelId;
    const channelName = channelDoc?.fields?.name?.stringValue || channelHandle;

    // ── 2. Create task in Firestore ───────────────────────────────────────────
    const taskId = `task_${Date.now()}`;
    await fsPatch(token, `tasks/${taskId}`, {
      title:          { stringValue: videoTitle },
      channel:        { stringValue: channelHandle },
      channelId:      { stringValue: channelId },
      type:           { stringValue: type },
      editorUid:      editorUid ? { stringValue: editorUid } : { nullValue: null },
      editorName:     { stringValue: "Unassigned" },
      headEditorUid:  headEditorUid ? { stringValue: headEditorUid } : { nullValue: null },
      status:         { stringValue: "Open" },
      adminPrice:     { doubleValue: adminPrice },
      editorPay:      { doubleValue: editorPay },
      headPay:        { doubleValue: headPay },
      adminEarning:   { doubleValue: adminPrice - editorPay - headPay },
      submissionLink: { stringValue: "" },
      youtubeUrl:     { stringValue: youtubeUrl },
      notes:          { stringValue: notes },
      due:            { stringValue: due },
      zohoLogged:     { booleanValue: false },
      createdAt:      { timestampValue: new Date().toISOString() },
      updatedAt:      { timestampValue: new Date().toISOString() },
    });

    // ── 3. Collect recipients ─────────────────────────────────────────────────
    const recipients: Array<{
      uid: string; email: string; name: string; role: "head_editor" | "editor"; fcmToken?: string;
    }> = [];

    const addRecipient = async (uid: string, role: "head_editor" | "editor") => {
      if (!uid || recipients.find(r => r.uid === uid)) return;
      const doc = await fsGet(token, `users/${uid}`);
      if (!doc?.fields) return;
      recipients.push({
        uid,
        email: doc.fields.email?.stringValue || "",
        name: doc.fields.name?.stringValue || role,
        role,
        fcmToken: doc.fields.fcmToken?.stringValue || undefined,
      });
    };

    // Head editor + their subordinates
    if (headEditorUid) {
      await addRecipient(headEditorUid, "head_editor");

      // List all users — find editors sourced_by this head editor
      const allUsersRes = await fetch(`${FIRESTORE_URL}/users?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allUsersData = await allUsersRes.json();
      if (allUsersData.documents) {
        for (const doc of allUsersData.documents) {
          const f = doc.fields;
          if (
            f?.role?.stringValue === "editor" &&
            f?.sourced_by?.stringValue === headEditorUid
          ) {
            await addRecipient(f.uid?.stringValue, "editor");
          }
        }
      }
    }

    // Directly assigned editor
    if (editorUid) await addRecipient(editorUid, "editor");

    // ── 4. Notify all recipients (in-app + FCM + email) ───────────────────────
    const notifyResults = await Promise.allSettled(
      recipients.map(async (r) => {
        const isHead = r.role === "head_editor";
        const ctaLink = isHead
          ? "https://crm.skillbridgeladder.in/head-editor/tasks"
          : "https://crm.skillbridgeladder.in/editor/tasks";
        const notifTitle = `🎬 New Video: ${videoTitle}`;
        const notifMessage = isHead
          ? `A new video "${videoTitle}" was added to ${channelHandle}. Review & assign to your team.`
          : `New video "${videoTitle}" on ${channelHandle} — check if it's assigned to you.`;

        // (a) In-app Firestore notification
        await writeNotif(token, r.uid, {
          type: "new_video",
          title: notifTitle,
          message: notifMessage,
          ctaLink,
        });

        // (b) FCM push → installed PWA / downloaded app
        if (r.fcmToken) {
          await sendFCMPush(token, r.fcmToken, {
            title: notifTitle,
            body: notifMessage,
            url: ctaLink,
          });
        }

        // (c) Branded email with logo
        const html = isHead
          ? buildNewVideoEmail({
              toName: r.name,
              videoTitle,
              channel: channelName,
              type,
              assignedEditors: editorUid ? ["Assigned"] : ["Unassigned"],
              tasksLink: ctaLink,
            })
          : buildTaskAssignedEmail({
              toName: r.name,
              taskTitle: videoTitle,
              channel: channelHandle,
              type,
              due: due || "ASAP",
              pay: editorPay,
              taskLink: ctaLink,
            });

        await sendEmail(
          r.email,
          `SkillBridge CRM: New video — ${videoTitle}`,
          html
        );

        return { uid: r.uid, name: r.name, role: r.role, pushedPWA: !!r.fcmToken };
      })
    );

    const notified = notifyResults
      .filter(r => r.status === "fulfilled")
      .map(r => (r as PromiseFulfilledResult<any>).value);

    return NextResponse.json({
      success: true,
      taskId,
      notifiedCount: notified.length,
      recipients: notified,
    });
  } catch (err: any) {
    console.error("[/api/video-ticket] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
