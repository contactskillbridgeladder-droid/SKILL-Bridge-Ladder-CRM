"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
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
          setLoading(false);
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

  const handleLogout = async () => {
    try {
      const { auth } = await initFirebase();
      await signOut(auth);
      router.push("/login");
    } catch (err: any) {
      setError("Sign out failed.");
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
            <p className="page-subtitle">Manage your personal settings and contact information.</p>
          </div>
        </div>

        <div className="section-card animate-fade" style={{ maxWidth: 640, padding: 32 }}>
          {message && (
            <div style={{
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#34d399",
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 13,
              marginBottom: 20
            }}>
              ✅ {message}
            </div>
          )}

          {error && (
            <div className="form-error" style={{ marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Name */}
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

            {/* Email (Read Only + Badge) */}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="email"
                  readOnly
                  className="crm-input"
                  value={user.email}
                  style={{ flex: 1, opacity: 0.6, background: "rgba(255,255,255,0.02)" }}
                />
                <span className={`badge ${user.emailVerified ? "badge-green" : "badge-amber"}`} style={{ padding: "6px 12px", fontSize: 11 }}>
                  {user.emailVerified ? "✓ Verified" : "Unverified"}
                </span>
              </div>
            </div>

            {/* WhatsApp */}
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

            {/* Role (Read Only) */}
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

            {/* Sourced By (Read Only) */}
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

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 24, gap: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: "10px 24px" }}>
                  {saving ? "Saving Changes…" : "Save Profile"}
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
      </main>
    </div>
  );
}
