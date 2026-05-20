"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";

interface VersionRelease {
  version: string;
  tag: string;
  date: string;
  status: "latest" | "stable" | "legacy";
  changes: string[];
}

export default function VersionPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const { doc, getDoc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setRole(snap.data().role || "editor");
          }
        }
        setLoading(false);
      });
    });
    return () => unsubAuth?.();
  }, []);

  const releases: VersionRelease[] = [
    {
      version: "v1.4.0",
      tag: "AI Video Copilot & PWA Live Update Manager",
      date: "May 20, 2026",
      status: "latest",
      changes: [
        "Integrated AI Video Copilot Chat Assistant for interactive video script ideas, hook brainstorming, and task brief formulations.",
        "Created PWA Live Update Manager to detect updates in real-time and safely notify users to reload to apply new versions.",
        "Refactored Firebase Admin SDK initialization to remove local credential JSON dependencies and fallback to secure Vercel environment variables."
      ]
    },
    {
      version: "v1.3.0",
      tag: "Custom OTP Verification & Stateless Mailer",
      date: "May 20, 2026",
      status: "stable",
      changes: [
        "Replaced client-side Firebase sendEmailVerification (which failed with 400 bad request) with custom 6-digit OTP verification.",
        "Removed Firebase Admin SDK JSON dependency from send-verification route to resolve server-side 500 errors on Vercel.",
        "Stateless email dispatcher connected directly to high-deliverability Resend Worker API.",
        "Upgraded signup and login verification state screen with visual 6-digit input field, verification loaders, and resend timers.",
        "Fixed login verification redirections to store and read verification status directly from Firestore users collection."
      ]
    },
    {
      version: "v1.2.0",
      tag: "Security & Dynamic Invites Update",
      date: "May 19, 2026",
      status: "stable",
      changes: [
        "Dynamic Invites system with customizable expiry dates, invite links, and specific roles.",
        "Zero-secrets source code security via Cloudflare Workers dynamically fetching Firebase config.",
        "Full mobile responsive layout redesign for login, register, and dashboard screens (removed border artifacts).",
        "Direct email verification system requiring verification to bypass registration redirects.",
        "Real-time database subscription sync on Editor and Head Editor dashboards (replacing mock data).",
        "Robust messaging fallbacks on contacts and active chat objects to prevent crashes on profile name load."
      ]
    },
    {
      version: "v1.1.0",
      tag: "Security Auditing & AI Integration",
      date: "May 14, 2026",
      status: "stable",
      changes: [
        "Audit Log database collection tracking for all critical administrative updates.",
        "AI transcription and prompt log history tracking dashboard.",
        "Improved service worker caching rules to support smooth offline and low-bandwidth loads.",
        "Enhanced security rules for Cloud Firestore."
      ]
    },
    {
      version: "v1.0.0",
      tag: "Initial Core Release",
      date: "May 08, 2026",
      status: "legacy",
      changes: [
        "Role-based portal structure for Admin, Head Editor, and Editor.",
        "Realtime Database messaging system for direct team communication.",
        "Video Shorts production workflow tracking.",
        "Core profile page settings with avatar upload supports."
      ]
    }
  ];

  const getBackLink = () => {
    if (role === "admin") return "/admin";
    if (role === "head_editor") return "/head-editor";
    return "/editor";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top left, #18181b, #09090b)",
      color: "var(--text)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 20px"
    }}>
      <div style={{ maxWidth: 800, width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }} className="animate-fade">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--primary), #a78bfa)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              boxShadow: "0 8px 24px rgba(139, 92, 246, 0.2)"
            }}>
              🚀
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em" }}>Version History</h1>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>System updates and releases for SkillBridge CRM</p>
            </div>
          </div>
          
          {!loading && (
            <Link href={getBackLink()} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
              ← Dashboard
            </Link>
          )}
        </div>

        {/* Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {releases.map((rel, idx) => (
            <div key={rel.version} className="card animate-fade" style={{
              position: "relative",
              border: rel.status === "latest" ? "1px solid rgba(139, 92, 246, 0.3)" : "1px solid var(--border)",
              boxShadow: rel.status === "latest" ? "0 10px 30px rgba(139, 92, 246, 0.05)" : "none"
            }}>
              {rel.status === "latest" && (
                <div style={{
                  position: "absolute",
                  top: -12,
                  right: 20,
                  background: "linear-gradient(135deg, var(--primary), #a78bfa)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "4px 10px",
                  borderRadius: 99,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  Current Version
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: rel.status === "latest" ? "var(--primary)" : "var(--text)" }}>{rel.version}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-dim)" }}>— {rel.tag}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Released on {rel.date}</div>
                </div>
              </div>

              <ul style={{ paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {rel.changes.map((change, cIdx) => (
                  <li key={cIdx} style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: "1.5" }}>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 40, color: "var(--text-muted)", fontSize: 12 }}>
          © 2026 SkillBridge Ladder. All rights reserved.
        </div>
      </div>
    </div>
  );
}
