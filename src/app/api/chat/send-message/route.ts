export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/firebase-admin";
import { scanMessage } from "@/lib/ai-scanner";
import * as admin from "firebase-admin";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RTDB_URL = "https://skillbridge-crm-default-rtdb.firebaseio.com";

// ── Firebase Admin RTDB helper (initialises once per cold start) ─────────────
function getRtdb(): admin.database.Database {
  if (!admin.apps.length) {
    // Credentials are loaded from env or the SA JSON file on disk
    let credential: admin.credential.Credential;
    const email = process.env.FIREBASE_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (email && rawKey) {
      credential = admin.credential.cert({ client_email: email, private_key: rawKey, project_id: PROJECT_ID } as any);
    } else {
      // Fall back to SA JSON file (available locally)
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sa = require("../../../../../skillbridge-crm-firebase-adminsdk-fbsvc-18ba4e7b8a.json");
        credential = admin.credential.cert(sa);
      } catch {
        credential = admin.credential.applicationDefault();
      }
    }
    admin.initializeApp({ credential, databaseURL: RTDB_URL });
  } else if (!admin.app().options.databaseURL) {
    // App already initialised but without RTDB URL — patch it
    admin.app().options.databaseURL = RTDB_URL;
  }
  return admin.database();
}

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
    const { clientId, senderId, senderRole, text = "", type = "text", mediaData = null, editingMessageId = null } = body;

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

    // 8b. Write message + metadata via firebase-admin SDK (no REST auth issues)
    const rtdb = getRtdb();
    const chatRef = rtdb.ref(`chats/bridge_${clientId}`);

    // Push new message
    if (editingMessageId) {
      await chatRef.child(`messages/${editingMessageId}`).update({
        text: processedText,
        editedAt: Date.now()
      });
      return NextResponse.json({ success: true, message: { id: editingMessageId, text: processedText } });
    }

    // Push new message
    await chatRef.child("messages").push(msgPayload);

    // 9. Update Metadata & Unread Count for Receiver
    let recipientId = "";
    if (senderRole === "client") {
      recipientId = assignedEditorUid || "admin";
    } else {
      recipientId = clientId;
    }

    let displayMsg = processedText;
    if (type === "photo") displayMsg = "📷 Photo Attachment";
    if (type === "audio") displayMsg = "🎵 Voice Note";
    if (type === "video") displayMsg = "🎥 Video Submission";

    // Read current unread count then increment atomically
    const unreadSnap = await chatRef.child(`metadata/unreadCount/${recipientId}`).get();
    const currentUnread: number = (unreadSnap.val() as number) || 0;

    await chatRef.child("metadata").update({
      lastMessage: displayMsg,
      lastTimestamp: Date.now(),
      lastSenderId: senderId,
      clientId,
      editorId: assignedEditorUid,
      [`unreadCount/${recipientId}`]: currentUnread + 1
    });

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
