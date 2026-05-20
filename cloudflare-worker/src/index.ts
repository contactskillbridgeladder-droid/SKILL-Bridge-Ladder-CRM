export interface Env {
  FIREBASE_API_KEY: string;
  FIREBASE_AUTH_DOMAIN: string;
  FIREBASE_DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_STORAGE_BUCKET: string;
  FIREBASE_MESSAGING_SENDER_ID: string;
  FIREBASE_APP_ID: string;
  FIREBASE_MEASUREMENT_ID: string;
  FIREBASE_VAPID_KEY: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  RESEND_API_KEY: string;
  GEMINI_API_KEY: string;
  WORKER_AUTH_SECRET: string; // Secure token for /config/secrets — NOT the public API key
}

// ── Allowed origins (strict whitelist) ───────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://crm.skillbridgeladder.in",
  "https://skill-bridge-ladder-crm.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o));
}

// ── Security headers applied to EVERY response ──────────────────────────────
function secureHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : "null";
  return {
    // CORS — locked to specific domains, NOT wildcard
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    // Anti-XSS / Anti-clickjacking / Anti-sniffing
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Type": "application/json",
  };
}

// ── Rate limiter (in-memory, per-IP, resets on worker restart) ───────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;       // max requests per window
const RATE_WINDOW_MS = 60000; // 1 minute window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ── Input sanitizer (strip HTML/script tags from any string) ─────────────────
function sanitize(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = secureHeaders(origin);
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    // ── Preflight ────────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    if (isRateLimited(clientIP)) {
      return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
        status: 429, headers,
      });
    }

    const url = new URL(request.url);

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /config — Public Firebase client config (browser-safe, origin-locked)
    // ═══════════════════════════════════════════════════════════════════════════
    if (request.method === "GET" && url.pathname === "/config") {
      // Block direct browser URL visits (no Origin = someone typing the URL)
      const referer = request.headers.get("Referer") || "";
      const isValidRequest =
        isAllowedOrigin(origin) ||
        ALLOWED_ORIGINS.some(o => referer.startsWith(o));

      if (!isValidRequest) {
        return new Response(JSON.stringify({ error: "Access denied." }), {
          status: 403, headers,
        });
      }

      return new Response(JSON.stringify({
        apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN,
        databaseURL: env.FIREBASE_DATABASE_URL,
        projectId: env.FIREBASE_PROJECT_ID,
        storageBucket: env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
        appId: env.FIREBASE_APP_ID,
        measurementId: env.FIREBASE_MEASUREMENT_ID,
        vapidKey: env.FIREBASE_VAPID_KEY,
      }), { headers });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GET /config/secrets — Server-only credentials (locked by secret token)
    // ═══════════════════════════════════════════════════════════════════════════
    if (request.method === "GET" && url.pathname === "/config/secrets") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");

      // Authenticate with the dedicated WORKER_AUTH_SECRET — NOT the public API key
      if (!env.WORKER_AUTH_SECRET || token !== env.WORKER_AUTH_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers,
        });
      }

      return new Response(JSON.stringify({
        geminiApiKey: env.GEMINI_API_KEY,
        firebaseClientEmail: env.FIREBASE_CLIENT_EMAIL,
        firebasePrivateKey: env.FIREBASE_PRIVATE_KEY,
      }), { headers });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST /send-email — Email sending via Resend (origin-locked)
    // ═══════════════════════════════════════════════════════════════════════════
    if (request.method === "POST" && url.pathname === "/send-email") {
      if (!isAllowedOrigin(origin)) {
        return new Response(JSON.stringify({ error: "Origin not allowed." }), {
          status: 403, headers,
        });
      }

      try {
        const body = await request.json() as {
          to?: string | string[];
          subject?: string;
          html?: string;
          replyTo?: string;
        };

        if (!body.to || !body.subject || !body.html) {
          return new Response(JSON.stringify({ error: "Missing required fields: to, subject, html" }), {
            status: 400, headers,
          });
        }

        // Sanitize subject to prevent header injection
        const safeSubject = sanitize(body.subject);

        const resendReq = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "SkillBridge CRM <notifications@crm.skillbridgeladder.in>",
            reply_to: body.replyTo ?? "hr@skillbridgeladder.in",
            to: Array.isArray(body.to) ? body.to : [body.to],
            subject: safeSubject,
            html: body.html,
          })
        });

        const resendRes = await resendReq.json() as Record<string, unknown>;
        return new Response(JSON.stringify(resendRes), {
          status: resendReq.ok ? 200 : 400, headers,
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Internal error." }), {
          status: 500, headers,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Catch-all — 404 for everything else
    // ═══════════════════════════════════════════════════════════════════════════
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404, headers,
    });
  },
};
