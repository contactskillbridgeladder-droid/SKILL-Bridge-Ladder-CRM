import * as adminApp from "firebase-admin/app";
import * as adminAuth from "firebase-admin/auth";
import * as adminFirestore from "firebase-admin/firestore";
import { readFileSync } from "fs";
import path from "path";

function getAdminApp() {
  if (adminApp.getApps().length > 0) return adminApp.getApp();

  // Read JSON file at runtime from project root — never baked into env vars
  const jsonPath = path.resolve(process.cwd(), "skillbridge-crm-firebase-adminsdk-fbsvc-3d64026130.json");
  const serviceAccount = JSON.parse(readFileSync(jsonPath, "utf-8"));

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
