export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const RTDB_URL = "https://skillbridge-crm-default-rtdb.firebaseio.com";

async function getAccessToken(): Promise<string> {
  const { getAccessToken: _get } = await import("@/lib/firebase-admin");
  return _get();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chatId, text } = body;

    if (!chatId || !text) {
      return NextResponse.json({ error: "Missing required fields: chatId, text" }, { status: 400 });
    }

    // Infer the sender from the chatId (the second ID is usually the recipient, but we can't be 100% sure without passing senderId).
    // Let's require senderId to be passed from the SW.
    const { senderId } = body;
    if (!senderId) {
      return NextResponse.json({ error: "Missing required field: senderId" }, { status: 400 });
    }

    // Extract the other user's ID
    const [id1, id2] = chatId.split("_");
    const recipientId = id1 === senderId ? id2 : id1;

    const token = await getAccessToken();

    // 1. Write the message to RTDB
    // We use a POST request to RTDB to auto-generate a push ID
    const msgPayload = {
      senderId,
      text,
      timestamp: Date.now(),
      status: "sent"
    };

    const msgRes = await fetch(`${RTDB_URL}/chats/${chatId}/messages.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(msgPayload)
    });

    if (!msgRes.ok) {
      const err = await msgRes.text();
      console.error("Failed to post reply:", err);
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }

    // 2. Fetch current unread count to increment it
    const metaRes = await fetch(`${RTDB_URL}/chats/${chatId}/metadata/unreadCount/${recipientId}.json`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const unreadCount = (await metaRes.json()) || 0;

    // 3. Update metadata in RTDB
    const metaUpdate = {
      lastMessage: text,
      lastTimestamp: Date.now(),
      lastSenderId: senderId,
      [`unreadCount/${recipientId}`]: unreadCount + 1
    };

    await fetch(`${RTDB_URL}/chats/${chatId}/metadata.json`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(metaUpdate)
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Reply API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
