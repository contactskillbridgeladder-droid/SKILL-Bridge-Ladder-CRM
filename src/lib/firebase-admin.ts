import * as adminApp from "firebase-admin/app";
import * as adminAuth from "firebase-admin/auth";
import * as adminFirestore from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import path from "path";

export function getGoogleAuthCredentials() {
  const envKey = process.env.FIREBASE_ADMIN_SDK_JSON;
  if (envKey) {
    try {
      if (envKey.trim().startsWith("{")) {
        return JSON.parse(envKey);
      } else {
        return JSON.parse(Buffer.from(envKey, "base64").toString("utf-8"));
      }
    } catch (err: any) {
      console.error("❌ Failed to parse FIREBASE_ADMIN_SDK_JSON environment variable:", err.message);
      return null;
    }
  }

  const jsonPath = path.resolve(process.cwd(), "skillbridge-crm-firebase-adminsdk-fbsvc-3d64026130.json");
  if (existsSync(jsonPath)) {
    try {
      return JSON.parse(readFileSync(jsonPath, "utf-8"));
    } catch (err: any) {
      console.error("❌ Failed to parse local service account JSON file:", err.message);
      return null;
    }
  }

  return null;
}

function getAdminApp() {
  if (adminApp.getApps().length > 0) return adminApp.getApp();

  const serviceAccount = getGoogleAuthCredentials();
  if (!serviceAccount) {
    throw new Error(
      "❌ Firebase Admin SDK could not be initialized: Missing credentials. " +
      "Please set the 'FIREBASE_ADMIN_SDK_JSON' environment variable in Vercel " +
      "with the contents of your service account JSON file."
    );
  }

  return adminApp.initializeApp({
    credential: adminApp.cert(serviceAccount),
    databaseURL: "https://skillbridge-crm-default-rtdb.firebaseio.com",
  });
}

export function getAdminAuth() {
  return adminAuth.getAuth(getAdminApp());
}

export function getAdminDb() {
  return adminFirestore.getFirestore(getAdminApp());
}
