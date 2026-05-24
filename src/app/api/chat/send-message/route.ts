export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const RTDB_URL = "https://skillbridge-crm-default-rtdb.firebaseio.com";

async function getAccessToken(): Promise<string> {
  const { getAccessToken: _get } = await import("@/lib/firebase-admin");
  return _get();
}

async function getGeminiApiKey(): Promise<string | null> {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const { getServerSecrets } = await import("@/lib/firebase-admin");
      const secrets = await getServerSecrets();
      apiKey = secrets.geminiApiKey;
    } catch (err) {
      console.error("Failed to fetch Gemini API key:", err);
    }
  }
  return apiKey || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, senderId, senderRole, text = "", type = "text", mediaData = null } = body;

    if (!clientId || !senderId || !senderRole) {
      return NextResponse.json({ error: "Missing required fields: clientId, senderId, senderRole" }, { status: 400 });
    }

    const token = await getAccessToken();

    // 1. Fetch Client Profile from Firestore to retrieve Assigned Editor and AI settings
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

    let processedText = text;
    let wasModerated = false;

    // 2. AI Content Checker (Only for client/editor if scanner is active)
    if (!aiScannerDisabled && (senderRole === "client" || senderRole === "editor") && type === "text") {
      // Local robust Regex filtering (Emails, Phone numbers, Non-Google Drive links)
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
      const phoneRegex = /(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
      const linkRegex = /https?:\/\/(?!drive\.google\.com)[a-zA-Z0-9-._~:\/?#\[\]@!$&'()*+,;=]+/gi;
      // Common written contact loops (spelled out numbers or direct requests)
      const contactSpellingRegex = /\b(nine|eight|seven|six|five|four|three|two|one|zero|dot|at)\b/gi;

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

      if (localTriggered) {
        processedText = localCensored;
        wasModerated = true;
      }

      // Secondary Deep Content Scanning via Gemini 2.5 Flash
      const apiKey = await getGeminiApiKey();
      if (apiKey) {
        try {
          const systemInstruction = `You are a security chat scanner. Inspect the message text between a Client and an Editor.
Verify if it contains phone numbers, email addresses, external links, social media handles, or spellings that try to bypass rules (e.g. "my mail is name at domain dot com" or spelling numbers "nine eight...").
Strict Rule: ONLY allow Google Drive links (drive.google.com). Block ALL other links.
Provide a clean JSON response. If contact details or unapproved links are present, set isBlocked to true and provide the censoredText replacing contact/links with "[Blocked Info]". If safe, set isBlocked to false.
Return ONLY this JSON schema:
{"isBlocked": boolean, "censoredText": "string"}
Do not include any markdown backticks or block formatting. Output must be raw JSON.`;

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

      // 3. Log blocked attempt & increment count in Firestore
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
        const { logActivity: _log } = await import("@/lib/firestore");
        await _log(
          "AI Blocked Information",
          `Censored message from ${senderRole === "client" ? clientEmail : "Editor"} on chat bridge_${clientId}. Censored details: "${text.substring(0, 100)}..."`,
          adminUser
        );
      }
    }

    // 4. Save message to RTDB
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

    // 5. Update Metadata & Unread Count for Receiver
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

    // 6. Trigger Push Notification to recipient
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
