export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const PROJECT_ID = "skillbridge-crm";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

async function getAccessToken(): Promise<string> {
  const { getAccessToken: _get } = await import("@/lib/firebase-admin");
  return _get();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      adminUid, email, password, name, whatsappNumber, role, 
      sourced_by = "", assignedEditorUid = "" 
    } = body;

    if (!adminUid || !email || !password || !name || !role) {
      return NextResponse.json({ error: "Missing required fields: adminUid, email, password, name, role" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long." }, { status: 400 });
    }

    const token = await getAccessToken();

    // 1. Verify Admin Permissions
    const adminRes = await fetch(`${FIRESTORE_URL}/users/${adminUid}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!adminRes.ok) {
      return NextResponse.json({ error: "Admin profile verification failed." }, { status: 403 });
    }

    const adminData = await adminRes.json();
    const adminRole = adminData.fields?.role?.stringValue;

    if (adminRole !== "admin") {
      return NextResponse.json({ error: "Unauthorized. Admin permissions required." }, { status: 403 });
    }

    // 2. Resolve Firebase Web API Key
    let apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!apiKey) {
      try {
        const configRes = await fetch(`${WORKER_URL}/config`);
        if (configRes.ok) {
          const config = await configRes.json();
          apiKey = config.apiKey;
        }
      } catch (err) {
        console.error("Failed to fetch dynamically from Cloudflare worker config:", err);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Identity Platform API Key not resolved." }, { status: 500 });
    }

    // 3. Create User in Firebase Auth via Google Identity Toolkit REST API
    const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName: name,
        returnSecureToken: false
      })
    });

    if (!authRes.ok) {
      const authError = await authRes.json();
      const errMsg = authError.error?.message || "Auth registration failed.";
      let friendlyMsg = errMsg;
      
      if (errMsg === "EMAIL_EXISTS") {
        friendlyMsg = "This email is already registered in Firebase Auth.";
      } else if (errMsg === "WEAK_PASSWORD") {
        friendlyMsg = "The password is too weak.";
      }
      
      return NextResponse.json({ error: friendlyMsg }, { status: 400 });
    }

    const authData = await authRes.json();
    const newUid = authData.localId; // The generated UID

    // 4. Create User Profile Document in Firestore
    const firestorePayload = {
      fields: {
        uid: { stringValue: newUid },
        email: { stringValue: email },
        name: { stringValue: name },
        whatsappNumber: { stringValue: whatsappNumber || "" },
        role: { stringValue: role },
        sourced_by: { stringValue: role === "editor" ? sourced_by : "" },
        assignedEditorUid: { stringValue: role === "client" ? assignedEditorUid : "" },
        createdAt: { timestampValue: new Date().toISOString() },
        isEmailVerified: { booleanValue: true },
        isBanned: { booleanValue: false }
      }
    };

    const fsWriteRes = await fetch(`${FIRESTORE_URL}/users/${newUid}`, {
      method: "PATCH", // Using PATCH creates or updates the document smoothly
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(firestorePayload)
    });

    if (!fsWriteRes.ok) {
      const fsErr = await fsWriteRes.text();
      console.error("Firestore writing error during manual user registration:", fsErr);
      return NextResponse.json({ error: "User registered in Auth, but failed to write Firestore profile document." }, { status: 500 });
    }

    // Log the successful administrator activity via REST (client-side SDK cannot run in Node.js)
    try {
      const adminName = adminData.fields?.name?.stringValue || "Admin";
      const adminEmail = adminData.fields?.email?.stringValue || "";
      await fetch(`${FIRESTORE_URL}/audit_logs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            action: { stringValue: "Manual Member Registration" },
            details: { stringValue: `Admin manually registered user ${email} under the role: ${role}` },
            performedByUid: { stringValue: adminUid },
            performedByName: { stringValue: adminName },
            performedByEmail: { stringValue: adminEmail },
            createdAt: { timestampValue: new Date().toISOString() }
          }
        })
      });
    } catch (auditErr) {
      console.error("Audit log write failed:", auditErr);
    }

    return NextResponse.json({ 
      success: true, 
      uid: newUid,
      message: `User ${email} registered successfully.` 
    });

  } catch (error: any) {
    console.error("Manual registration error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
