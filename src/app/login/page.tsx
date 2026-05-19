"use client";
import React, { useState, Suspense } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { initFirebase } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const allowSignUp = inviteCode === "SKILLBRIDGE2026";

  const [mode, setMode] = useState<"login" | "signup">(allowSignUp ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { auth, db } = await initFirebase();
      if (mode === "signup" && allowSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid, email, role: "editor", sourced_by: "Invite",
        });
        router.push("/editor");
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        const role = snap.exists() ? snap.data().role : "editor";
        if (role === "admin") router.push("/admin");
        else if (role === "head_editor") router.push("/head-editor");
        else router.push("/editor");
      }
    } catch (err: any) {
      const msg: Record<string, string> = {
        "auth/invalid-credential": "Wrong email or password.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Wrong password.",
        "auth/email-already-in-use": "This email is already registered.",
        "auth/weak-password": "Password must be at least 6 characters.",
      };
      setError(msg[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card animate-fade">
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 8px 32px rgba(124,58,237,0.4)" }}>⚡</div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }} className="gradient-text">SkillBridge CRM</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
              {mode === "signup" ? "Create your account (Invite Only)" : "Sign in to continue"}
            </p>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <input id="email" type="email" required autoComplete="email"
              className="crm-input" placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input id="password" type="password" required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="crm-input" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4, padding: "12px 18px", fontSize: 14 }}>
            {loading
              ? (mode === "signup" ? "Creating account…" : "Signing in…")
              : (mode === "signup" ? "Create account" : "Sign in →")
            }
          </button>
        </form>

        {allowSignUp && (
          <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
            {mode === "signup" ? "Already have an account? " : "Have an invite? "}
            <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
              style={{ background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              {mode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        )}

        <p style={{ marginTop: 28, textAlign: "center", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          Access to this platform is restricted to<br/>authorized SkillBridge Ladder team members.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }}>Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
