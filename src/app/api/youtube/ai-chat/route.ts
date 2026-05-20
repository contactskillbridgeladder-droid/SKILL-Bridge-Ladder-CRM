import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'Messages are required' }, { status: 400 });
    }

    let apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const WORKER_URL = process.env.NEXT_PUBLIC_CF_WORKER_URL || "https://skillbridge-crm-env.contact-skillbridgeladder.workers.dev";
        let authKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
        if (!authKey) {
          const cfgPublicRes = await fetch(`${WORKER_URL}/config`);
          if (cfgPublicRes.ok) {
            const cfgPublic = await cfgPublicRes.json();
            authKey = cfgPublic.apiKey;
          }
        }
        if (authKey) {
          const cfgRes = await fetch(`${WORKER_URL}/config/secrets`, {
            headers: { "Authorization": `Bearer ${authKey}` }
          });
          if (cfgRes.ok) {
            const cfg = await cfgRes.json();
            apiKey = cfg.geminiApiKey;
          }
        }
      } catch (err) {
        console.error("Failed to fetch gemini api key from cloudflare worker secrets endpoint:", err);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "Gemini API key is not configured." }, { status: 500 });
    }

    // Convert messages format for Gemini API (user & model)
    const contents = messages.map((m: any) => ({
      role: m.sender === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    // Inject system instructions
    const systemPrompt = `You are a helpful, professional video-editing agency CRM assistant. 
You help administrators with tasks creation, editor assignment, video scripts, video titles, description formatting, and video channel strategies.
Be concise, helpful, and speak directly. Keep answers brief and professional.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const replyText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    return NextResponse.json({ success: true, reply: replyText });

  } catch (error: any) {
    console.error("ai-chat error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
