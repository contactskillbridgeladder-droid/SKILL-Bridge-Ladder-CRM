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

      self.registration.showNotification(notification.title || "SkillBridge CRM", {
        body: notification.body || "You have a new notification",
        icon: notification.icon || "/logo.png",
        badge: "/logo.png",
        image: notification.image,
        data: { url: clickUrl },
        tag: data.tag || "skillbridge-notification",
        renotify: true,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        actions: [
          { action: "open", title: "Open CRM" },
          { action: "dismiss", title: "Dismiss" },
        ],
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

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "SkillBridge CRM", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "SkillBridge CRM", {
      body: data.body || "",
      icon: data.icon || "/logo.png",
      badge: "/logo.png",
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
      tag: "skillbridge-push",
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
