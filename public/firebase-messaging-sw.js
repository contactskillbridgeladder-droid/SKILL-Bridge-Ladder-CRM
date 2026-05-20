// SkillBridge CRM — Firebase Cloud Messaging Service Worker
// Handles background push notifications for the installed PWA

const CF_WORKER_URL = "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

// Cache the config after first fetch
let _config = null;

async function getFirebaseConfig() {
  if (_config) return _config;
  try {
    const res = await fetch(`${CF_WORKER_URL}/config`);
    _config = await res.json();
    return _config;
  } catch (e) {
    console.error("[SW] Failed to fetch Firebase config:", e);
    return null;
  }
}

// Import Firebase scripts
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// Self-initializing service worker — fetches config from CF Worker on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    getFirebaseConfig().then((config) => {
      if (!config || !config.apiKey) return;
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp({
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            storageBucket: config.storageBucket,
            messagingSenderId: config.messagingSenderId,
            appId: config.appId,
          });
        }
        console.log("[SW] Firebase initialized for project:", config.projectId);
      } catch (e) {
        console.error("[SW] Firebase init error:", e);
      }
    })
  );
});

// ── Background FCM Message Handler ────────────────────────────────────────────
// This fires when the app is NOT in the foreground
self.addEventListener("message", (event) => {
  if (event.data?.type === "FCM_BACKGROUND") {
    const { title, body, icon, url } = event.data;
    self.registration.showNotification(title || "SkillBridge CRM", {
      body: body || "You have a new notification",
      icon: icon || "/logo.png",
      badge: "/logo.png",
      data: { url: url || "/" },
      tag: "skillbridge-notification",
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
  }
});

// Lazy-initialize messaging after config is fetched
getFirebaseConfig().then((config) => {
  if (!config?.apiKey) return;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
    }

    const messaging = firebase.messaging();

    // ── Handle background FCM messages ──────────────────────────────────────
    messaging.onBackgroundMessage((payload) => {
      console.log("[SW] Background FCM message:", payload);

      const notification = payload.notification || {};
      const data = payload.data || {};
      const clickUrl = data.url || notification.click_action || "/";
      const isChat = data.type === "chat_message";
      const title = data.title || notification.title || "SkillBridge CRM";
      const body = data.body || notification.body || "You have a new notification";

      const actions = [
        { action: "open", title: "Open CRM" },
        { action: "dismiss", title: "Dismiss" },
      ];

      // Add reply action for chat messages
      if (isChat) {
        actions.unshift({ 
          action: "reply", 
          title: "Reply",
          type: "text" // Requires user input
        } as any);
      }

      self.registration.showNotification(title, {
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
  } catch (e) {
    console.error("[SW] Messaging setup error:", e);
  }
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
  // But for data-only messages on Android Chrome, the SDK sometimes misses it, so we handle it manually.
  let data: any = {};
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
    } as any);
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
