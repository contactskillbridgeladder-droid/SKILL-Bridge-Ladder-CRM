import * as adminApp from "firebase-admin/app";
import * as adminAuth from "firebase-admin/auth";
import * as adminFirestore from "firebase-admin/firestore";
import { readFileSync } from "fs";
import path from "path";

export function getGoogleAuthCredentials() {
  const envKey = process.env.FIREBASE_ADMIN_SDK_JSON;
  if (envKey) {
    if (envKey.trim().startsWith("{")) {
      return JSON.parse(envKey);
    } else {
      return JSON.parse(Buffer.from(envKey, "base64").toString("utf-8"));
    }
  } else {
    const jsonPath = path.resolve(process.cwd(), "skillbridge-crm-firebase-adminsdk-fbsvc-3d64026130.json");
    return JSON.parse(readFileSync(jsonPath, "utf-8"));
  }
}

function getAdminApp() {
  if (adminApp.getApps().length > 0) return adminApp.getApp();

  const serviceAccount = getGoogleAuthCredentials();

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
