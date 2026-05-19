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
  RESEND_API_KEY: string;
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/config") {
      // 1. Origin/Referer Validation to block direct browser access and scraping
      const origin = request.headers.get("Origin") || "";
      const referer = request.headers.get("Referer") || "";

      const isAllowed = 
        !origin && !referer ||
        origin.includes("localhost") || 
        origin.includes("127.0.0.1") || 
        origin.includes("skillbridgeladder.in") ||
        origin.includes("vercel.app") ||
        referer.includes("localhost") || 
        referer.includes("127.0.0.1") || 
        referer.includes("skillbridgeladder.in") ||
        referer.includes("vercel.app");

      if (!isAllowed) {
        return new Response(JSON.stringify({ error: "Access Denied: Unauthorized request origin." }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const config = {
        apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN,
        databaseURL: env.FIREBASE_DATABASE_URL,
        projectId: env.FIREBASE_PROJECT_ID,
        storageBucket: env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
        appId: env.FIREBASE_APP_ID,
        measurementId: env.FIREBASE_MEASUREMENT_ID,
        vapidKey: env.FIREBASE_VAPID_KEY,
      };

      return new Response(JSON.stringify(config), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (request.method === "GET" && url.pathname === "/config/secrets") {
      const authHeader = request.headers.get("Authorization") || "";
      if (authHeader !== `Bearer ${env.FIREBASE_API_KEY}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({ geminiApiKey: env.GEMINI_API_KEY }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    if (request.method === "POST" && url.pathname === "/send-email") {
      try {
        const body = await request.json() as {
          to?: string | string[];
          subject?: string;
          html?: string;
          replyTo?: string;
        };
        
        if (!body.to || !body.subject || !body.html) {
          return new Response(JSON.stringify({ error: "Missing required fields: to, subject, html" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const resendReq = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // ✅ Resend verified domain: crm.skillbridgeladder.in
            // auth.crm.skillbridgeladder.in is Firebase Auth only (not Resend)
            from: "SkillBridge CRM <notifications@crm.skillbridgeladder.in>",
            reply_to: body.replyTo ?? "hr@skillbridgeladder.in",
            to: Array.isArray(body.to) ? body.to : [body.to],
            subject: body.subject,
            html: body.html,
          })
        });

        const resendRes = await resendReq.json() as Record<string, unknown>;

        // Return with status mirroring Resend's
        return new Response(JSON.stringify(resendRes), {
          status: resendReq.ok ? 200 : 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  },
};
