export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/firebase-admin";
import { scanMessage } from "@/lib/ai-scanner";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RTDB_URL = "https://skillbridge-crm-default-rtdb.firebaseio.com";

// ── Google Identity Provider Token Validation ────────────────────────────────
async function verifyIdToken(idToken: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Pentest Firewall] verifyIdToken lookup failed:", errText);
    throw new Error("Invalid or expired session token.");
  }

  const data = await res.json();
  const uid = data.users?.[0]?.localId;
  if (!uid) {
    throw new Error("User profile not found in identity provider.");
  }
  return uid;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, senderId, senderRole, text = "", type = "text", mediaData = null } = body;

    if (!clientId || !senderId || !senderRole) {
      return NextResponse.json({ error: "Missing required fields: clientId, senderId, senderRole" }, { status: 400 });
    }

    // Resolve Firebase Web API Key for ID token verification
    let apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";
      try {
        const configRes = await fetch(`${WORKER_URL}/config`);
        if (configRes.ok) {
          const config = await configRes.json();
          apiKey = config.apiKey;
        }
      } catch (err) {
        console.error("Failed to fetch worker config inside send-message:", err);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Identity Platform API Key not resolved." }, { status: 500 });
    }

    // 1. Authenticate the Caller via ID Token (Pentest Hardening)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token." }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let authenticatedUid = "";
    try {
      authenticatedUid = await verifyIdToken(idToken, apiKey);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }

    const token = await getAccessToken();

    // 2. Fetch the authenticated user's document from Firestore to verify role (Security RBAC)
    const callerRes = await fetch(`${FIRESTORE_URL}/users/${authenticatedUid}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!callerRes.ok) {
      return NextResponse.json({ error: "Authenticated user profile not found." }, { status: 403 });
    }

    const callerData = await callerRes.json();
    const callerRole = callerData.fields?.role?.stringValue || "";

    // 3. Prevent Client-Side Masquerading (Pentest Hardening - Admins & Head Editors can bypass to use proxy roles)
    const isPrivileged = callerRole === "admin" || callerRole === "head_editor";
    if (!isPrivileged) {
      if (authenticatedUid !== senderId) {
        return NextResponse.json({ error: "Impersonation Blocked: senderId does not match authenticated user." }, { status: 403 });
      }

      if (callerRole !== senderRole) {
        return NextResponse.json({ error: "Impersonation Blocked: senderRole does not match authenticated role." }, { status: 403 });
      }
    }

    // 4. Fetch Client Profile from Firestore to retrieve Assigned Editor and AI settings
    const clientRes = await fetch(`${FIRESTORE_URL}/users/${clientId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!clientRes.ok) {
      return NextResponse.json({ error: "Client profile not found" }, { status: 404 });
    }

    const clientData = await clientRes.json();
    const assignedEditorUid = clientData.fields?.assignedEditorUid?.stringValue || "";
    const aiScannerDisabled = clientData.fields?.aiScannerDisabled?.booleanValue === true;
    let blockedCount = parseInt(clientData.fields?.blockedMessagesCount?.integerValue || "0", 10);
    const clientEmail = clientData.fields?.email?.stringValue || "";
    const clientName = clientData.fields?.name?.stringValue || clientEmail;

    // 5. Validate Context-Specific Authorization Rules
    if (!isPrivileged) {
      if (senderRole === "client") {
        if (senderId !== clientId) {
          return NextResponse.json({ error: "Access Denied: Clients can only post to their own bridge." }, { status: 403 });
        }
      } else if (senderRole === "editor") {
        if (assignedEditorUid !== senderId) {
          return NextResponse.json({ error: "Access Denied: You are not the assigned editor for this client." }, { status: 403 });
        }
      } else if (senderRole === "head_editor") {
        // Allow Head Editors globally in general bridge operations
      } else if (senderRole === "admin") {
        // Admins are globally authorized
      } else {
        return NextResponse.json({ error: "Access Denied: Invalid role." }, { status: 403 });
      }
    }

    let processedText = text;
    let wasModerated = false;
    let violations: string[] = [];

    // ══════════════════════════════════════════════════════════════════════════
    // 6. AI SAFETY SCANNER — 100-Rule Local Engine (Zero API calls)
    // ══════════════════════════════════════════════════════════════════════════
    if (!aiScannerDisabled && (senderRole === "client" || senderRole === "editor") && type === "text") {
      const result = scanMessage(text);

      if (result.wasModerated) {
        processedText = result.censored;
        wasModerated = true;
        violations = result.violations;
      }

      // 7. Log blocked attempt & increment count in Firestore
      if (wasModerated) {
        blockedCount += 1;
        await fetch(`${FIRESTORE_URL}/users/${clientId}?updateMask.fieldPaths=blockedMessagesCount`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              blockedMessagesCount: { integerValue: String(blockedCount) }
            }
          })
        });

        // Audit Log — direct Firestore REST call
        try {
          await fetch(`${FIRESTORE_URL}/audit_logs`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                action: { stringValue: "AI Scanner Blocked Information" },
                details: { stringValue: `[Rules: ${violations.join(", ")}] Censored message from ${senderRole === "client" ? clientEmail : "Editor"} on bridge_${clientId}. Original: "${text.substring(0, 150)}..."` },
                performedByUid: { stringValue: "system" },
                performedByName: { stringValue: "AI Safety Scanner" },
                performedByEmail: { stringValue: "security@skillbridge.in" },
                createdAt: { timestampValue: new Date().toISOString() }
              }
            })
          });
        } catch (auditErr) {
          console.error("Audit log write failed:", auditErr);
        }
      }
    }

    // 8. Save message to RTDB
    const msgPayload = {
      senderId,
      senderRole,
      text: processedText,
      type,
      mediaData,
      timestamp: Date.now(),
      status: "sent"
    };

    const msgRes = await fetch(`${RTDB_URL}/chats/bridge_${clientId}/messages.json?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msgPayload)
    });

    if (!msgRes.ok) {
      const errText = await msgRes.text();
      throw new Error(`Failed to write to RTDB: ${msgRes.status} ${errText}`);
    }

    // 9. Update Metadata & Unread Count for Receiver
    let recipientId = "";
    if (senderRole === "client") {
      recipientId = assignedEditorUid || "admin"; // Forward to editor or fallback to admin
    } else {
      recipientId = clientId; // Editor/Admin to Client
    }

    let displayMsg = processedText;
    if (type === "photo") displayMsg = "📷 Photo Attachment";
    if (type === "audio") displayMsg = "🎵 Voice Note";
    if (type === "video") displayMsg = "🎥 Video Submission";

    // Fetch unread count for recipient
    const unreadRes = await fetch(`${RTDB_URL}/chats/bridge_${clientId}/metadata/unreadCount/${recipientId}.json?access_token=${token}`);
    if (!unreadRes.ok) {
      const errText = await unreadRes.text();
      throw new Error(`Failed to fetch unread count from RTDB: ${unreadRes.status} ${errText}`);
    }
    const currentUnread = (await unreadRes.json()) || 0;

    const metaUpdate: Record<string, any> = {
      lastMessage: displayMsg,
      lastTimestamp: Date.now(),
      lastSenderId: senderId,
      clientId,
      editorId: assignedEditorUid,
      [`unreadCount/${recipientId}`]: currentUnread + 1
    };

    const patchRes = await fetch(`${RTDB_URL}/chats/bridge_${clientId}/metadata.json?access_token=${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaUpdate)
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`Failed to patch metadata in RTDB: ${patchRes.status} ${errText}`);
    }

    // 10. Trigger Push Notification to recipient
    if (recipientId) {
      try {
        let title = "New Message";
        let message = displayMsg;
        let ctaLink = "/messages";

        if (senderRole === "client") {
          title = `New Message from Client: ${clientName}`;
          ctaLink = `/messages?clientId=${clientId}`;
        } else {
          title = "New Message from Manager";
          ctaLink = "/client";
        }

        const baseUrl = new URL(request.url).origin;
        fetch(`${baseUrl}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toUid: recipientId,
            title,
            message,
            type: "chat_message",
            chatId: `bridge_${clientId}`,
            ctaText: "Reply Now",
            ctaLink
          })
        }).catch(err => console.error("Notification trigger failed:", err));
      } catch (notifErr) {
        console.error("Async notification failed:", notifErr);
      }
    }

    return NextResponse.json({ success: true, message: msgPayload });

  } catch (error: any) {
    try { 
      const fs = require('fs');
      const logPath = require('path').join(process.cwd(), 'debug_error.log');
      fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] ERROR:\n` + String(error?.stack || error?.message || error) + `\n`);
    } catch(e){}
    console.error("send-message api error:", error?.stack || error?.message || error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
