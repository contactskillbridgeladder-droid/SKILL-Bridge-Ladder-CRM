import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getDatabase, Database } from "firebase/database";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";
import { getMessaging, getToken, Messaging } from "firebase/messaging";

// NOTE: This worker URL is environment-sensitive. The app fetches Firebase configurations 
// dynamically from the Cloudflare Worker environment to prevent exposing hardcoded keys.
const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let rtdb: Database;
let analytics: Analytics | undefined;
let messaging: Messaging | undefined;

let initializationPromise: Promise<any> | null = null;

export async function initFirebase() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      const res = await fetch(`${WORKER_URL}/config`);
      if (!res.ok) throw new Error("Failed to fetch config from worker");

      const config = await res.json();

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

      if (typeof window !== "undefined") {
        const supported = await isSupported();
        if (supported) analytics = getAnalytics(app);

        // Init FCM messaging if supported
        try {
          messaging = getMessaging(app);
        } catch { /* unsupported browser */ }
      }

      return { app, auth, db, rtdb, analytics, messaging };
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
 * Uses the VAPID key from the Worker config.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const { messaging: msg } = await initFirebase();
    if (!msg) return null;

    // Fetch VAPID key from worker config
    const res = await fetch(`${WORKER_URL}/config`);
    const config = await res.json();
    const vapidKey = config.vapidKey;
    if (!vapidKey) return null;

    const token = await getToken(msg, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration("/"),
    });
    return token || null;
  } catch (err) {
    console.error("[FCM] getToken error:", err);
    return null;
  }
}

