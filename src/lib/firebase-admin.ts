/**
 * Firebase Server Credentials — fetched from Cloudflare Worker secrets.
 * No JSON file needed. No Vercel env vars needed.
 * All secrets live in one place: Cloudflare Worker → Settings → Variables.
 */

const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";

interface ServerSecrets {
  geminiApiKey?: string;
  firebaseClientEmail?: string;
  firebasePrivateKey?: string;
}

let cachedSecrets: ServerSecrets | null = null;

/** Fetch all server secrets from the Cloudflare Worker /config/secrets endpoint */
export async function getServerSecrets(): Promise<ServerSecrets> {
  if (cachedSecrets) return cachedSecrets;

  // Get the Firebase API key (used as auth token for the secrets endpoint)
  let authKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  if (!authKey) {
    try {
      const cfgRes = await fetch(`${WORKER_URL}/config`);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        authKey = (cfg as any).apiKey || "";
      }
    } catch {}
  }

  if (!authKey) throw new Error("Cannot authenticate to fetch server secrets — no Firebase API key available.");

  const res = await fetch(`${WORKER_URL}/config/secrets`, {
    headers: { Authorization: `Bearer ${authKey}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch server secrets: ${res.status}`);

  cachedSecrets = (await res.json()) as ServerSecrets;
  return cachedSecrets;
}

/** Returns a short-lived Google OAuth2 access token for Firestore REST & FCM. */
export async function getAccessToken(): Promise<string> {
  // Try local env vars first, then fall back to Cloudflare Worker secrets
  let client_email = process.env.FIREBASE_CLIENT_EMAIL;
  let private_key  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!client_email || !private_key) {
    const secrets = await getServerSecrets();
    client_email = secrets.firebaseClientEmail;
    private_key  = secrets.firebasePrivateKey?.replace(/\\n/g, "\n");
  }

  if (!client_email || !private_key) {
    throw new Error(
      "Firebase server credentials not found. Add FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY " +
      "as secrets in your Cloudflare Worker dashboard."
    );
  }

  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    credentials: { client_email, private_key } as any,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("Failed to obtain Google access token.");
  return t.token;
}

// Legacy exports
export function getGoogleAuthCredentials() {
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  const private_key  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) return null;
  return { client_email, private_key };
}
