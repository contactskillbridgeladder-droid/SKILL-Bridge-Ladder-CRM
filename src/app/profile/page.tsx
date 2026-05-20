"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut, updatePassword, updateEmail } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<{
    uid: string;
    email: string;
    name: string;
    whatsappNumber: string;
    role: string;
    sourced_by?: string;
    emailVerified: boolean;
  } | null>(null);

  const [nameInput, setNameInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Change Password States
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Change Email States
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Desktop Notification Permission
  const [notifPermission, setNotifPermission] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    initFirebase().then(({ auth, db }) => {
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) {
          router.push("/login");
          return;
        }
        
        getDoc(doc(db, "users", u.uid)).then((snap: any) => {
          const d = snap.data();
          const profileData = {
            uid: u.uid,
            email: u.email || "",
            name: d?.name || "",
            whatsappNumber: d?.whatsappNumber || "",
            role: d?.role || "editor",
            sourced_by: d?.sourced_by || "",
            emailVerified: d?.isEmailVerified === true
          };
          setUser(profileData);
          setNameInput(profileData.name);
          setWhatsappInput(profileData.whatsappNumber);

          // Fetch active sessions
          const { collection, getDocs, query, where } = require("firebase/firestore");
          const sessQuery = query(collection(db, "users", u.uid, "sessions"), where("status", "==", "active"));
          getDocs(sessQuery).then((sessSnap: any) => {
            const list = sessSnap.docs.map((d: any) => d.data());
            setSessions(list);
            setCurrentSessionId(localStorage.getItem("currentSessionId"));
            setLoading(false);
          }).catch((err: any) => {
            console.error("Error fetching sessions:", err);
            setLoading(false);
          });
        }).catch((err) => {
          console.error("Error fetching user profile:", err);
          setLoading(false);
        });
      });
    });
    return () => unsub?.();
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { db } = await initFirebase();
      await updateDoc(doc(db, "users", user.uid), {
        name: nameInput.trim(),
        whatsappNumber: whatsappInput.trim()
      });
      setUser(prev => prev ? { ...prev, name: nameInput.trim(), whatsappNumber: whatsappInput.trim() } : null);
      setMessage("Profile updated successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const terminateSession = async (sessId: string) => {
    if (!user) return;
    try {
      const { db } = await initFirebase();
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", user.uid, "sessions", sessId), {
        status: "terminated"
      });
      setSessions(prev => prev.filter(s => s.id !== sessId));
      setMessage("Session terminated successfully.");
    } catch (err: any) {
      setError("Failed to terminate session: " + err.message);
    }
  };

  const parseUserAgent = (ua: string) => {
    if (!ua) return "Unknown Device";
    let browser = "Other Browser";
    let os = "Other OS";
    
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr|opios/i.test(ua)) browser = "Google Chrome";
    else if (/firefox|fxios/i.test(ua)) browser = "Mozilla Firefox";
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Apple Safari";
    else if (/edge|edg/i.test(ua)) browser = "Microsoft Edge";
    else if (/opr|opios/i.test(ua)) browser = "Opera";

    if (/windows/i.test(ua)) os = "Windows";
    else if (/macintosh|mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) os = "macOS";
    else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
    else if (/android/i.test(ua)) os = "Android";
    else if (/linux/i.test(ua)) os = "Linux";

    return `${browser} on ${os}`;
  };

  const handleLogout = async () => {
    try {
      const { auth } = await initFirebase();
      await signOut(auth);
      router.push("/login");
    } catch (err: any) {
      setError("Sign out failed.");
    }
  };

  const requestNotifPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === "granted") {
      setMessage("Desktop notifications enabled successfully!");
      try {
        const { getFCMToken } = await import("@/lib/firebase");
        const token = await getFCMToken();
        if (token && user) {
          const { db } = await initFirebase();
          const { doc, updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "users", user.uid), { fcmToken: token });
        }
      } catch (e) {
        console.error("FCM token update failed:", e);
      }
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    setMessage("");
    setError("");
    try {
      const { auth } = await initFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No user logged in.");
      await updatePassword(currentUser, newPassword);
      setMessage("Password updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      if (err.code === "auth/requires-recent-login") {
        setError("For security reasons, changing your password requires recent authentication. Please sign out, sign back in, and try again.");
      } else {
        setError(err.message || "Failed to update password.");
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail.trim() === user?.email) {
      setError("Please enter a new, different email address.");
      return;
    }
    setEmailSaving(true);
    setMessage("");
    setError("");
    try {
      const { auth, db } = await initFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No user logged in.");
      
      await updateEmail(currentUser, newEmail.trim());
      await updateDoc(doc(db, "users", currentUser.uid), {
        email: newEmail.trim()
      });

      setUser(prev => prev ? { ...prev, email: newEmail.trim() } : null);
      setMessage("Email address updated successfully!");
      setNewEmail("");
    } catch (err: any) {
      if (err.code === "auth/requires-recent-login") {
        setError("For security reasons, changing your email requires recent authentication. Please sign out, sign back in, and try again.");
      } else {
        setError(err.message || "Failed to update email.");
      }
    } finally {
      setEmailSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading Profile…</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="app-shell">
      <Sidebar role={user.role} userName={user.name} uid={user.uid} />
      <main className="app-main">
        <div className="page-header animate-fade">
          <div>
            <h1 className="page-title">My Profile</h1>
            <p className="page-subtitle">Manage your personal settings, password, and desktop notification permissions.</p>
          </div>
        </div>

        {message && (
          <div style={{
            background: "rgba(16,185,129,0.08)",
            border: "1px solid rgba(16,185,129,0.2)",
            color: "#34d399",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 13,
            marginBottom: 24,
            maxWidth: 640
          }}>
            ✅ {message}
          </div>
        )}

        {error && (
          <div className="form-error" style={{ marginBottom: 24, maxWidth: 640 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 640 }}>
          {/* Card 1: Profile Details */}
          <div className="section-card animate-fade" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Profile Details</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Update your public name and WhatsApp contact number.
            </p>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="profileName">Full Name</label>
                <input
                  id="profileName"
                  type="text"
                  required
                  className="crm-input"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="profileWhatsapp">WhatsApp Number</label>
                <input
                  id="profileWhatsapp"
                  type="tel"
                  required
                  className="crm-input"
                  value={whatsappInput}
                  onChange={e => setWhatsappInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Platform Role</label>
                <input
                  type="text"
                  readOnly
                  className="crm-input"
                  value={user.role.replace("_", " ").toUpperCase()}
                  style={{ opacity: 0.6, background: "rgba(255,255,255,0.02)" }}
                />
              </div>

              {user.sourced_by && (
                <div className="form-group">
                  <label className="form-label">Sourced By / Invite Code</label>
                  <input
                    type="text"
                    readOnly
                    className="crm-input"
                    value={user.sourced_by}
                    style={{ opacity: 0.6, background: "rgba(255,255,255,0.02)" }}
                  />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 24, gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                    {saving ? "Saving Changes…" : "Save Details"}
                  </button>
                  <Link href="/version" className="btn btn-secondary" style={{ padding: "10px 20px", textDecoration: "none" }}>
                    System Version
                  </Link>
                </div>
                <button type="button" onClick={handleLogout} className="btn btn-secondary" style={{ padding: "10px 20px", color: "var(--red)", borderColor: "rgba(239,68,68,0.2)" }}>
                  Sign Out
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Desktop Push Notifications */}
          <div className="section-card animate-fade" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Desktop Push Notifications</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              Get Windows and browser notifications instantly when new tasks are assigned, comments are left, or payments are released.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Notification Status</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {notifPermission === "granted" && "✓ Enabled (Real-time popups will appear in bottom corner)"}
                    {notifPermission === "denied" && "✕ Blocked (Please reset site permissions in your browser address bar)"}
                    {notifPermission === "default" && "Disabled (Click enable to prompt browser permission)"}
                  </div>
                </div>
                <div>
                  {notifPermission === "granted" ? (
                    <span className="badge badge-green" style={{ padding: "6px 12px" }}>Active</span>
                  ) : notifPermission === "denied" ? (
                    <span className="badge badge-red" style={{ padding: "6px 12px" }}>Blocked</span>
                  ) : (
                    <button onClick={requestNotifPermission} className="btn btn-primary btn-sm">Enable</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Account Security (Change Email & Password) */}
          <div className="section-card animate-fade" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Account Security</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Update your registered login credentials. Note that email or password updates may prompt you to sign in again for security verification.
            </p>

            {/* Email Form */}
            <form onSubmit={handleUpdateEmail} style={{ display: "flex", flexDirection: "column", gap: 16, borderBottom: "1px solid var(--border)", paddingBottom: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-dim)" }}>Change Email Address</h3>
              <div className="form-group">
                <label className="form-label">Current Email</label>
                <input type="email" readOnly className="crm-input" value={user.email} style={{ opacity: 0.6, background: "rgba(255,255,255,0.02)" }} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="newEmailInput">New Email Address</label>
                <input id="newEmailInput" type="email" required className="crm-input" placeholder="Enter new email address" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div>
                <button type="submit" disabled={emailSaving} className="btn btn-primary btn-sm">
                  {emailSaving ? "Updating Email..." : "Update Email"}
                </button>
              </div>
            </form>

            {/* Password Form */}
            <form onSubmit={handleUpdatePassword} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-dim)" }}>Change Password</h3>
              <div className="form-group">
                <label className="form-label" htmlFor="newPasswordInput">New Password</label>
                <input id="newPasswordInput" type="password" required className="crm-input" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="confirmPasswordInput">Confirm New Password</label>
                <input id="confirmPasswordInput" type="password" required className="crm-input" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <div>
                <button type="submit" disabled={passwordSaving} className="btn btn-primary btn-sm">
                  {passwordSaving ? "Updating Password..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>

          <div className="section-card animate-fade" style={{ padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Active Login Sessions & Devices</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              You are currently logged in on these devices. Terminating a session will log that device out of the platform immediately.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {sessions.map((sess) => {
                const isCurrent = sess.id === currentSessionId;
                const formattedDate = sess.lastActive?.seconds
                  ? new Date(sess.lastActive.seconds * 1000).toLocaleString()
                  : sess.lastActive
                    ? new Date(sess.lastActive).toLocaleString()
                    : "Unknown";

                return (
                  <div
                    key={sess.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 20px",
                      background: "rgba(255,255,255,0.02)",
                      border: isCurrent ? "1px solid rgba(59,130,246,0.3)" : "1px solid var(--border)",
                      borderRadius: 12,
                      gap: 16
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: isCurrent ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20
                        }}
                      >
                        {sess.userAgent?.toLowerCase().includes("mobi") ? "📱" : "💻"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                          {parseUserAgent(sess.userAgent)}
                          {isCurrent && (
                            <span className="badge badge-green" style={{ fontSize: 10, padding: "2px 6px" }}>
                              Current Device
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          Last active: {formattedDate}
                        </div>
                      </div>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => terminateSession(sess.id)}
                        className="btn btn-secondary"
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          color: "var(--red)",
                          borderColor: "rgba(239,68,68,0.2)"
                        }}
                      >
                        Log Out Device
                      </button>
                    )}
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: 13 }}>
                  No active sessions found.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
