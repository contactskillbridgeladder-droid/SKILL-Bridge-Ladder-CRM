// SkillBridge CRM — Firebase Cloud Messaging Service Worker
// Handles background push notifications for the installed PWA

// Import Firebase scripts
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// CRITICAL FOR ANDROID: Firebase MUST be initialized synchronously!
// If this is delayed by a fetch request, Android kills the background worker before it registers the message handler.
firebase.initializeApp({
  apiKey: "AIzaSyAdcmMhLCUjeZIRlaRRZd8h9PywN6_Gu1Q",
  authDomain: "auth.crm.skillbridgeladder.in",
  projectId: "skillbridge-crm",
  storageBucket: "skillbridge-crm.firebasestorage.app",
  messagingSenderId: "141902383537",
  appId: "1:141902383537:web:5269fd7bb248d2d02e5590"
});

const messaging = firebase.messaging();

// ── Background FCM Message Handler ────────────────────────────────────────────
// This explicit handler is REQUIRED by Android to keep the background task alive.
// It MUST return a promise (via showNotification) so Android knows the task completed.
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background FCM message:", payload);

  const notification = payload.notification || {};
  const data = payload.data || {};
  const isChat = data.type === "chat_message";
  const title = notification.title || data.title || "SkillBridge CRM";
  const body = notification.body || data.body || "You have a new notification";
  const clickUrl = data.url || notification.click_action || "/";

  const actions = [
    { action: "open", title: "Open CRM" },
    { action: "dismiss", title: "Dismiss" },
  ];

  if (isChat) {
    actions.unshift({ 
      action: "reply", 
      title: "Reply",
      type: "text"
    });
  }

  return self.registration.showNotification(title, {
    body: body,
    icon: "/logo.png",
    badge: "/logo.png",
    data: { url: clickUrl, chatId: data.chatId, type: data.type, recipientId: data.recipientId },
    tag: data.tag || (isChat ? `chat-${data.chatId}` : "skillbridge-notification"),
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    actions,
  });
});

// ── Notification Click Handler ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/";
  const absoluteUrl = url.startsWith("http") ? url : `https://crm.skillbridgeladder.in${url}`;

  // Handle WhatsApp-style inline reply
  if (event.action === "reply") {
    const replyText = event.reply;
    const chatId = event.notification.data?.chatId;
    const senderId = event.notification.data?.recipientId; // The user receiving the notif is the sender of the reply
    if (replyText && chatId && senderId) {
      event.waitUntil(
        fetch(`/api/messages/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, text: replyText, senderId })
        }).catch(err => console.error("[SW] Reply failed:", err))
      );
    }
    return;
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing CRM window/tab if open
        for (const client of clientList) {
          if (
            (client.url.includes("crm.skillbridgeladder.in") ||
              client.url.includes("localhost:3000")) &&
            "focus" in client
          ) {
            client.navigate(absoluteUrl);
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(absoluteUrl);
      })
  );
});

// ── Push Event Fallback (non-FCM direct Web Push) ─────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  // If Firebase Messaging SDK already handled it, this might be redundant.
  let data = {};
  try {
    data = event.data.json();
  } catch {
    return; // Cannot parse
  }

  // If the payload has a 'notification' object, the browser handles it automatically.
  if (data.notification) return;

  // Extract from FCM data object
  const payload = data.data || {};
  const isChat = payload.type === "chat_message";
  const title = payload.title || "SkillBridge CRM";
  const body = payload.body || "You have a new notification";

  const actions = [
    { action: "open", title: "Open CRM" },
    { action: "dismiss", title: "Dismiss" },
  ];

  if (isChat) {
    actions.unshift({ 
      action: "reply", 
      title: "Reply",
      type: "text"
    });
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url: payload.url || "/", chatId: payload.chatId, type: payload.type, recipientId: payload.recipientId },
      vibrate: [200, 100, 200],
      tag: payload.tag || (isChat ? `chat-${payload.chatId}` : "skillbridge-push"),
      actions
    })
  );
});

// ── Service Worker Lifecycle ──────────────────────────────────────────────────
self.addEventListener("install", () => {
  console.log("[SW] SkillBridge CRM service worker installed");
  self.skipWaiting();
});

self.addEventListener("fetch", () => {
  // Required to be a valid service worker — let Next.js PWA handle caching
});
