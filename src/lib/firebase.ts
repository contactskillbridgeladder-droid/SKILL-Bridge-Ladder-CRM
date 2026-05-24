import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getDatabase, Database } from "firebase/database";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getMessaging, getToken, Messaging } from "firebase/messaging";
import { getStorage, FirebaseStorage } from "firebase/storage";

// NOTE: This worker URL is environment-sensitive. The app fetches Firebase configurations 
// dynamically from the Cloudflare Worker environment to prevent exposing hardcoded keys.
const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let rtdb: Database;
let storage: FirebaseStorage;
let analytics: Analytics | undefined;
let messaging: Messaging | undefined;

let initializationPromise: Promise<any> | null = null;
let cachedConfig: any = null;

export async function initFirebase() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const res = await fetch(`${WORKER_URL}/config`);
      if (!res.ok) throw new Error("Failed to fetch config from worker");

      const config = await res.json();
      cachedConfig = config;

      const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } = await import("firebase/firestore");

      app = !getApps().length ? initializeApp(config) : getApp();
      auth = getAuth(app);

      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch (err) {
        db = getFirestore(app);
      }

      rtdb = getDatabase(app);
      storage = getStorage(app);

      if (typeof window !== "undefined") {
        const supported = await isSupported();
        if (supported) analytics = getAnalytics(app);
        // NOTE: Messaging is initialized lazily in getFCMToken() to avoid
        // IndexedDB "connection is closing" errors during PWA updates.
        // Do NOT call getMessaging(app) here.
      }

      return { app, auth, db, rtdb, storage, analytics, messaging: undefined };
    } catch (error) {
      initializationPromise = null;
      console.error("Failed to initialize Firebase:", error);
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Requests FCM push token. Call after Notification.requestPermission() === 'granted'.
 * Lazily initializes Firebase Messaging to avoid IDB race conditions during startup.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    await initFirebase();
    if (!app) return null;

    // Lazy-init messaging only when actually needed
    if (!messaging) {
      try {
        messaging = getMessaging(app);
      } catch {
        console.warn("[FCM] Messaging not supported in this browser.");
        return null;
      }
    }

    let config = cachedConfig;
    if (!config) {
      const res = await fetch(`${WORKER_URL}/config`);
      config = await res.json();
      cachedConfig = config;
    }
    const vapidKey = config.vapidKey;
    if (!vapidKey) return null;

    // Explicitly register firebase-messaging-sw.js to prevent scope-matching timeouts under Next.js PWA
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch (err) {
    console.error("[FCM] getToken error:", err);
    return null;
  }
}
