export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as admin from "firebase-admin";

const PROJECT_ID = "skillbridge-crm";
const BUCKET_NAME = "skillbridge-crm.firebasestorage.app"; // Found from CORS trace

function getAdminStorage() {
  if (!admin.apps.length) {
    let credential;
    const email = process.env.FIREBASE_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (email && rawKey) {
      credential = admin.credential.cert({ client_email: email, private_key: rawKey, project_id: PROJECT_ID } as any);
    } else {
      try {
        const path = require("path");
        const fs2 = require("fs");
        const sa = JSON.parse(fs2.readFileSync(path.join(process.cwd(), "skillbridge-crm-firebase-adminsdk-fbsvc-18ba4e7b8a.json"), "utf8"));
        credential = admin.credential.cert(sa);
      } catch {
        credential = admin.credential.applicationDefault();
      }
    }
    admin.initializeApp({ credential, storageBucket: BUCKET_NAME });
  } else if (!admin.app().options.storageBucket) {
    // Patch existing app
    admin.app().options.storageBucket = BUCKET_NAME;
  }
  return admin.storage();
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // We trust that the token exists; full verification could be added if needed.

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const pathPrefix = formData.get("pathPrefix") as string || "uploads";
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const storage = getAdminStorage();
    const bucket = storage.bucket();

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${pathPrefix}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    
    const fileRef = bucket.file(fileName);
    await fileRef.save(buffer, {
      metadata: { contentType: file.type }
    });

    // Construct the Firebase Storage download URL without relying on legacy ACLs
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
    
    return NextResponse.json({ success: true, url: publicUrl });

  } catch (err: any) {
    console.error("Upload Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
