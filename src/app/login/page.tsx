"use client";
import React, { useState, useEffect, Suspense } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { initFirebase } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const allowSignUpParam = inviteCode === "SKILLBRIDGE2026";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Profile details for signup
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState(inviteCode || "");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationInput, setVerificationInput] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // 1. Keep logged in check (redirect automatically on mount/reload if already verified)
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "banned") {
      setError("This account has been banned. Access denied.");
    } else if (errorParam === "session_terminated") {
      setError("Your login session was terminated or opened on another device.");
    }

    let unsub: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsub = onAuthStateChanged(auth, (u) => {
        if (u) {
          getDoc(doc(db, "users", u.uid)).then((snap: any) => {
            const userData = snap.exists() ? snap.data() : {};
            if (userData.isBanned === true) {
              signOut(auth).then(() => {
                setError("This account has been banned. Access denied.");
                setCheckingAuth(false);
              });
              return;
            }
            const isVerified = userData.isEmailVerified === true;
            if (isVerified) {
              const role = userData.role || "editor";
              if (role === "admin") router.push("/admin");
              else if (role === "head_editor") router.push("/head-editor");
              else if (role === "client") router.push("/client");
              else if (role === "msg_only") router.push("/messages");
              else router.push("/editor");
            } else {
              setNeedsVerification(true);
              setCheckingAuth(false);
            }
          }).catch(() => {
            setCheckingAuth(false);
          });
        } else {
          setCheckingAuth(false);
        }
      });
    }).catch(() => {
      setCheckingAuth(false);
    });
    return () => unsub?.();
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { auth, db } = await initFirebase();

      if (mode === "signup") {
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setLoading(false);
          return;
        }

        // Invite validation
        let signupRole = "editor";
        let sourcedBy = "admin";
        const inviteCodeTrimmed = inviteCodeInput.trim();

        if (inviteCodeTrimmed !== "SKILLBRIDGE2026") {
          const inviteRef = doc(db, "invites", inviteCodeTrimmed);
          const inviteSnap = await getDoc(inviteRef);
          
          if (!inviteSnap.exists()) {
            setError("Invalid invite code. Signup is restricted to authorized team members.");
            setLoading(false);
            return;
          }
          
          const inviteData = inviteSnap.data();
          if (inviteData.status === "used") {
            setError("This invite link has already been used.");
            setLoading(false);
            return;
          }
          
          if (inviteData.expiresAt) {
            const expiresTime = inviteData.expiresAt.toMillis ? inviteData.expiresAt.toMillis() : new Date(inviteData.expiresAt).getTime();
            if (Date.now() > expiresTime) {
              setError("This invite link has expired.");
              setLoading(false);
              return;
            }
          }
          
          signupRole = inviteData.role || "editor";
          sourcedBy = inviteData.createdBy || "admin";
        }

        // Create authentication account
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        // Generate custom OTP code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Write complete User Profile to Firestore
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          email,
          name: fullName,
          whatsappNumber: whatsapp,
          role: signupRole,
          sourced_by: sourcedBy,
          createdAt: new Date(),
          isEmailVerified: false,
          emailVerificationCode: code
        });

        // Send High-deliverability verification email via custom API (Resend)
        try {
          await fetch("/api/auth/send-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code }),
          });
        } catch (emailErr) {
          console.error("Custom verification email failed:", emailErr);
        }

        // Mark dynamic invite as used
        if (inviteCodeTrimmed !== "SKILLBRIDGE2026") {
          const { updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "invites", inviteCodeTrimmed), {
            status: "used",
            usedBy: cred.user.uid,
            usedAt: new Date()
          });
        }

        setNeedsVerification(true);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        
        // Fetch Firestore profile to verify custom email status
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        const userData = snap.exists() ? snap.data() : {};

        if (userData.isBanned === true) {
          await signOut(auth);
          setError("This account has been banned. Access denied.");
          setLoading(false);
          return;
        }

        const isVerified = userData.isEmailVerified === true;
        
        if (!isVerified) {
          // Generate fresh verification code and email it
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          const { updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "users", cred.user.uid), {
            emailVerificationCode: code
          });

          try {
            await fetch("/api/auth/send-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: cred.user.email, code }),
            });
          } catch (emailErr) {
            console.error("Custom verification email failed:", emailErr);
          }
          setNeedsVerification(true);
          setLoading(false);
          return;
        }

        const role = userData.role || "editor";
        const name = userData.name || cred.user.email || "Team Member";

        // Fire security login alert email asynchronously
        try {
          const userAgent = navigator.userAgent;
          const timeString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toUid: cred.user.uid,
              toEmail: cred.user.email,
              toName: name,
              title: "🔒 Security Alert: New Login Detected",
              message: `We detected a new login to your SkillBridge CRM account on ${timeString} (IST).\n\nDevice details:\n${userAgent}\n\nIf this was you, no further action is required.`,
              type: "general",
              subject: "Security Alert: New Login Detected"
            })
          }).catch((e) => console.error("Async login notify failed:", e));
        } catch (alertErr) {
          console.error("Login alert setup failed:", alertErr);
        }

        if (role === "admin") router.push("/admin");
        else if (role === "head_editor") router.push("/head-editor");
        else if (role === "client") router.push("/client");
              else if (role === "msg_only") router.push("/messages");
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

  const verifyOTPCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setMessage("");
    if (!verificationInput.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setLoading(true);
    try {
      const { auth, db } = await initFirebase();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("No user is currently signed in. Please log in again.");
      }

      const userDocRef = doc(db, "users", user.uid);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        throw new Error("User profile not found.");
      }

      const userData = snap.data();
      const correctCode = userData.emailVerificationCode;
      
      if (verificationInput.trim() === correctCode) {
        // Mark verified in Firestore!
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(userDocRef, {
          isEmailVerified: true,
          emailVerificationCode: null // clear the code
        });

        // Set success message and redirect
        setMessage("Email verified successfully! Redirecting...");
        
        const role = userData.role || "editor";
        if (role === "admin") router.push("/admin");
        else if (role === "head_editor") router.push("/head-editor");
        else if (role === "client") router.push("/client");
              else if (role === "msg_only") router.push("/messages");
        else router.push("/editor");
      } else {
        setError("Invalid verification code. Please check your email and try again.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { auth, db } = await initFirebase();
      const user = auth.currentUser;
      if (user && user.email) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const userDocRef = doc(db, "users", user.uid);
        
        const { updateDoc } = await import("firebase/firestore");
        await updateDoc(userDocRef, {
          emailVerificationCode: code
        });

        const res = await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, code }),
        });
        
        if (res.ok) {
          setMessage("A new verification code has been sent to your email!");
        } else {
          throw new Error("Failed to send verification email. Please try again.");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    setMessage("");
    try {
      const { auth } = await initFirebase();
      await signOut(auth);
      setNeedsVerification(false);
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Render Verification Page State
  if (checkingAuth) {
    return (
      <div className="startup-loader-container">
        <div className="loader-logo-wrapper">
          <div className="loader-glow-ring"></div>
          <div className="loader-glow-ring-inner"></div>
          <img src="/logo.png" alt="SkillBridge CRM" className="loader-logo" />
        </div>
        <h1 className="loader-brand gradient-text">SkillBridge CRM</h1>
        <p className="loader-status">Verifying secure credentials...</p>
        <div className="loader-progress-track">
          <div className="loader-progress-bar"></div>
        </div>
      </div>
    );
  }

  if (needsVerification) {
    return (
      <div className="login-bg">
        <div className="login-card animate-fade" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 20 }}>✉️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>Verify Your Email</h2>
          <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 24 }}>
            We have sent a 6-digit verification code to <strong>{email || "your email address"}</strong>.<br/>
            Please check your inbox (and spam folder) and enter it below.
          </p>

          <form onSubmit={verifyOTPCode} style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            <div className="form-group">
              <input
                type="text"
                required
                maxLength={6}
                value={verificationInput}
                onChange={(e) => setVerificationInput(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter 6-digit code"
                style={{
                  textAlign: "center",
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: 4,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--text)",
                }}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>
          </form>

          {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}
          {message && <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{message}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button className="btn btn-secondary" onClick={resendVerification} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              Resend Verification Code
            </button>
            <button className="btn btn-ghost" onClick={handleLogout} style={{ width: "100%", justifyContent: "center", color: "#f87171" }}>
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-bg">
      <div className="login-card animate-fade">
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 8px 32px rgba(124,58,237,0.4)" }}>⚡</div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }} className="gradient-text">SkillBridge CRM</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
              {mode === "signup" ? "Create your CRM account" : "Sign in to continue"}
            </p>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "signup" && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="fullName">Full Name</label>
                <input id="fullName" type="text" required
                  className="crm-input" placeholder="John Doe"
                  value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="whatsapp">WhatsApp Number</label>
                <input id="whatsapp" type="tel" required
                  className="crm-input" placeholder="+91 98765 43210"
                  value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="inviteCode">Invite Code</label>
                <input id="inviteCode" type="text" required
                  className="crm-input" placeholder="Enter Invite Code (e.g. SKILLBRIDGE2026)"
                  value={inviteCodeInput} onChange={e => setInviteCodeInput(e.target.value)} />
              </div>
            </>
          )}

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

          {mode === "signup" && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
              <input id="confirmPassword" type="password" required
                autoComplete="new-password"
                className="crm-input" placeholder="••••••••"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4, padding: "12px 18px", fontSize: 14 }}>
            {loading
              ? (mode === "signup" ? "Registering account…" : "Signing in…")
              : (mode === "signup" ? "Register & Verify Email" : "Sign in →")
            }
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
          {mode === "signup" ? "Already have an account? " : "New team member? "}
          <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
            style={{ background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            {mode === "signup" ? "Sign in" : "Create Account / Sign up"}
          </button>
        </p>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
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
