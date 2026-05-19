export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

// This deploys Firestore Security Rules via REST API using the service account
export async function POST() {
  try {
    const { getGoogleAuthCredentials } = await import("@/lib/firebase-admin");
    const { GoogleAuth } = await import("google-auth-library");
    const key = getGoogleAuthCredentials();

    const auth = new GoogleAuth({
      credentials: key,
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/firebase",
      ],
    });
    const client = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    const token = tokenRes.token!;

    const PROJECT_ID = "skillbridge-crm";

    // Step 1: Get or create a ruleset
    const rulesSource = readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf-8");

    const rulesetRes = await fetch(
      `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            files: [{ name: "firestore.rules", content: rulesSource }],
          },
        }),
      }
    );
    const rulesetData = await rulesetRes.json();
    if (!rulesetRes.ok) throw new Error(`Ruleset create failed: ${JSON.stringify(rulesetData)}`);

    const rulesetName = rulesetData.name;

    // Step 2: Update the release to point to the new ruleset
    const releaseRes = await fetch(
      `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ release: { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName } }),
      }
    );
    const releaseData = await releaseRes.json();
    if (!releaseRes.ok) throw new Error(`Release update failed: ${JSON.stringify(releaseData)}`);

    return NextResponse.json({ success: true, rulesetName, message: "✅ Firestore security rules deployed!" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
