export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAccessToken, getServerSecrets } from "@/lib/firebase-admin";
import { logActivity } from "@/lib/firestore";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RTDB_URL = "https://skillbridge-crm-default-rtdb.firebaseio.com";

async function getGeminiApiKey(): Promise<string | null> {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const secrets = await getServerSecrets();
      apiKey = secrets.geminiApiKey;
    } catch (err) {
      console.error("Failed to fetch Gemini API key:", err);
    }
  }
  return apiKey || null;
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

    // 6. AI Content Checker (Only for client/editor if scanner is active)
    if (!aiScannerDisabled && (senderRole === "client" || senderRole === "editor") && type === "text") {
      // Local robust Regex filtering (Emails, Phone numbers, Non-Google Drive links)
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
      const phoneRegex = /(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
      const linkRegex = /https?:\/\/(?!drive\.google\.com)[a-zA-Z0-9-._~:\/?#\[\]@!$&'()*+,;=]+/gi;
      
      // Payment & Billing terms blocking Regex
      const paymentRegex = /\b(payment|payments|pay|invoice|invoices|money|bank|transfer|upi|paypal|stripe|gpay|phonepe|crypto|bitcoin|usdt|fees|cost|charge|dollars|rupees|usd|inr|wallet|card|credit card|debit card)\b/gi;

      let localCensored = text;
      let localTriggered = false;

      if (emailRegex.test(text)) {
        localCensored = localCensored.replace(emailRegex, "[Blocked Email]");
        localTriggered = true;
      }
      if (phoneRegex.test(text)) {
        localCensored = localCensored.replace(phoneRegex, "[Blocked Phone Number]");
        localTriggered = true;
      }
      if (linkRegex.test(text)) {
        localCensored = localCensored.replace(linkRegex, "[Blocked Link - Only Google Drive Allowed]");
        localTriggered = true;
      }
      if (paymentRegex.test(text)) {
        localCensored = localCensored.replace(paymentRegex, "[Blocked Payment/Billing Reference]");
        localTriggered = true;
      }

      if (localTriggered) {
        processedText = localCensored;
        wasModerated = true;
      }

      // Secondary Deep Content Scanning via Gemini 2.5 Flash
      const apiKeyVal = await getGeminiApiKey();
      if (apiKeyVal) {
        try {
          const systemInstruction = `You are a security chat scanner. Inspect the message text between a Client and an Editor.
Verify if it contains phone numbers, email addresses, external links, social media handles, payment details, billing links, or spellings that try to bypass rules (e.g. "my mail is name at domain dot com" or spelling numbers "nine eight...").
Strict Rule 1: ONLY allow Google Drive links (drive.google.com). Block ALL other links.
Strict Rule 2: Block any discussion or terms about direct payments, invoicing, paypal, stripe, transfers, crypto, or banking transactions.
Provide a clean JSON response. If contact/payment details or unapproved links are present, set isBlocked to true and provide the censoredText replacing contact/payment/links with "[Blocked Info]". If safe, set isBlocked to false.
Return ONLY this JSON schema:
{"isBlocked": boolean, "censoredText": "string"}
Do not include any markdown backticks or block formatting. Output must be raw JSON.`;

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyVal}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] }
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            
            try {
              // Parse out JSON if Gemini returns markdown wrappers
              const jsonStr = reply.replace(/```json/g, "").replace(/```/g, "").trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed.isBlocked) {
                processedText = parsed.censoredText;
                wasModerated = true;
              }
            } catch (jsonErr) {
              console.error("Gemini output parse error:", jsonErr, "Raw reply:", reply);
            }
          }
        } catch (geminiErr) {
          console.error("Gemini Scanner failed, using Regex safety fallbacks:", geminiErr);
        }
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

        // Audit Log
        const adminUser = { uid: "system", name: "AI Safety Agent", email: "security@skillbridge.in" };
        await logActivity(
          "AI Blocked Information",
          `Censored message from ${senderRole === "client" ? clientEmail : "Editor"} on chat bridge_${clientId}. Censored details: "${text.substring(0, 100)}..."`,
          adminUser
        );
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

    const msgRes = await fetch(`${RTDB_URL}/chats/bridge_${clientId}/messages.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(msgPayload)
    });

    if (!msgRes.ok) {
      return NextResponse.json({ error: "Failed to write to RTDB" }, { status: 500 });
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
    const unreadRes = await fetch(`${RTDB_URL}/chats/bridge_${clientId}/metadata/unreadCount/${recipientId}.json`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const currentUnread = (await unreadRes.json()) || 0;

    const metaUpdate: Record<string, any> = {
      lastMessage: displayMsg,
      lastTimestamp: Date.now(),
      lastSenderId: senderId,
      clientId,
      editorId: assignedEditorUid,
      [`unreadCount/${recipientId}`]: currentUnread + 1
    };

    await fetch(`${RTDB_URL}/chats/bridge_${clientId}/metadata.json`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(metaUpdate)
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
    console.error("send-message api error:", error);
    try {
      const logMsg = `[${new Date().toISOString()}] send-message error: ${error.stack || error.message}\n`;
      fs.appendFileSync(path.join(process.cwd(), "api_error.log"), logMsg);
    } catch (e) {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
