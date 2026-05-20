/**
 * Minimal Firebase server credentials — NO JSON file required.
 *
 * Add these two environment variables in Vercel → Settings → Environment Variables:
 *   FIREBASE_CLIENT_EMAIL   ← "client_email" field from your service account JSON
 *   FIREBASE_PRIVATE_KEY    ← "private_key"  field (paste the full -----BEGIN...END----- block)
 *
 * That's it. No file upload, no full JSON needed.
 */

export function getMinimalCredentials() {
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  const private_key  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) return null;
  return { client_email, private_key };
}

/** Returns a short-lived Google OAuth2 access token for Cloud APIs (Firestore REST, FCM). */
export async function getAccessToken(): Promise<string> {
  const creds = getMinimalCredentials();
  if (!creds) {
    throw new Error(
      "Firebase server credentials not configured. " +
      "Go to Vercel → Settings → Environment Variables and add:\n" +
      "  FIREBASE_CLIENT_EMAIL  (from your service account JSON)\n" +
      "  FIREBASE_PRIVATE_KEY   (from your service account JSON)"
    );
  }
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key } as any,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("Failed to obtain Google access token.");
  return t.token;
}

// Legacy exports for any code that still imports these
export function getGoogleAuthCredentials() { return getMinimalCredentials(); }
export function getAdminAuth() { throw new Error("Use getAccessToken() instead."); }
export function getAdminDb()   { throw new Error("Use getAccessToken() instead."); }
