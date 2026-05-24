"use client";
import { useState, useEffect } from "react";
import { getUsers, updateUserProfile, logActivity, UserProfile } from "@/lib/firestore";
import { StatSkeleton, TableSkeleton } from "@/components/Skeletons";
import { initFirebase } from "@/lib/firebase";

const roleLabel: Record<string, string> = { editor: "Editor", head_editor: "Head Editor", admin: "Admin" };
const roleBadge: Record<string, string> = { editor: "badge-blue", head_editor: "badge-purple", admin: "badge-green" };

export default function AdminTeam() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [currentUser, setCurrentUser] = useState<{ uid: string; name: string; email: string } | null>(null);

  // Invite link generator states
  const [showInviteGenerator, setShowInviteGenerator] = useState(false);
  const [inviteRole, setInviteRole] = useState<"editor" | "head_editor" | "client">("editor");
  const [inviteExpiry, setInviteExpiry] = useState("24"); // in hours
  const [generatedLink, setGeneratedLink] = useState("");
  const [generating, setGenerating] = useState(false);

  // Manual Registration States
  const [showManualRegister, setShowManualRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    whatsappNumber: "",
    password: "",
    role: "editor" as "editor" | "head_editor" | "client" | "admin",
    sourced_by: "",
    assignedEditorUid: ""
  });

  // Edit Modal States
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "editor" as "admin" | "head_editor" | "editor" | "client",
    sourced_by: "",
    whatsappNumber: "",
    isBanned: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Get current logged in admin
    initFirebase().then(async ({ auth }) => {
      const u = auth.currentUser;
      if (u) {
        setCurrentUser({
          uid: u.uid,
          name: u.displayName || "Veer",
          email: u.email || "hr@skillbridgeladder.in"
        });
      }
    });

    getUsers().then(u => { setUsers(u); setLoading(false); });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const filtered = users.filter(u => !search || [u.name, u.email, u.role].some(v => v?.toLowerCase().includes(search.toLowerCase())));
  const editors = users.filter(u => u.role === "editor");
  const heads = users.filter(u => u.role === "head_editor");
  const clients = users.filter(u => u.role === "client");
  const active = users.length;

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const { db } = await initFirebase();
      const code = "sb_inv_" + Math.random().toString(36).substring(2, 10);
      const hours = parseInt(inviteExpiry, 10);
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "invites", code), {
        id: code,
        role: inviteRole,
        createdBy: currentUser?.uid || "admin",
        createdAt: new Date(),
        expiresAt: expiresAt,
        status: "active",
        usedBy: ""
      });

      const link = window.location.origin + "/login?invite=" + code;
      setGeneratedLink(link);
      showToast("✅ Invite link generated successfully!");
    } catch (err: any) {
      showToast("❌ Failed to generate invite: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setRegistering(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUid: currentUser.uid,
          email: registerForm.email,
          password: registerForm.password,
          name: registerForm.name,
          whatsappNumber: registerForm.whatsappNumber,
          role: registerForm.role,
          sourced_by: registerForm.role === "editor" ? registerForm.sourced_by : "",
          assignedEditorUid: registerForm.role === "client" ? registerForm.assignedEditorUid : ""
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register user");

      showToast(`✅ Member ${registerForm.email} registered manually!`);
      setShowManualRegister(false);
      setRegisterForm({
        name: "",
        email: "",
        whatsappNumber: "",
        password: "",
        role: "editor",
        sourced_by: "",
        assignedEditorUid: ""
      });

      // Reload members list
      const updatedList = await getUsers();
      setUsers(updatedList);
    } catch (err: any) {
      showToast("❌ Registration failed: " + err.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleEditClick = (user: UserProfile) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "editor",
      sourced_by: user.role === "client" ? (user.assignedEditorUid || "") : (user.sourced_by || ""),
      whatsappNumber: user.whatsappNumber || "",
      isBanned: user.isBanned === true
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);

    try {
      const { db } = await initFirebase();
      const updateData: Partial<UserProfile> = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        whatsappNumber: editForm.whatsappNumber,
        sourced_by: editForm.role === "editor" ? editForm.sourced_by : "",
        assignedEditorUid: editForm.role === "client" ? editForm.sourced_by : "",
        isBanned: editForm.isBanned
      };

      await updateUserProfile(selectedUser.uid, updateData);

      if (editForm.isBanned) {
        // Terminate all user's sessions immediately
        const { collection, getDocs, writeBatch } = await import("firebase/firestore");
        const sessSnap = await getDocs(collection(db, "users", selectedUser.uid, "sessions"));
        const batch = writeBatch(db);
        sessSnap.forEach((sessDoc) => {
          batch.update(sessDoc.ref, { status: "terminated" });
        });
        await batch.commit();
      }

      // Log activity
      if (currentUser) {
        await logActivity(
          editForm.isBanned ? "Ban Team Member" : "Update Team Member",
          editForm.isBanned
            ? `Banned user ${selectedUser.email} and terminated all active sessions.`
            : `Updated user ${selectedUser.email} (Role: ${editForm.role}, Name: ${editForm.name})`,
          currentUser
        );
      }

      showToast(editForm.isBanned ? "🚫 Member banned and sessions terminated!" : "✅ Member profile updated successfully!");
      // Reload users list
      const updatedList = await getUsers();
      setUsers(updatedList);
      setSelectedUser(null);
    } catch (err: any) {
      showToast("❌ Update failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!selectedUser) return;
    if (!confirm(`Are you sure you want to permanently delete ${editForm.email}? This action cannot be undone.`)) return;
    setSaving(true);
    try {
      const { db } = await initFirebase();
      const { deleteDoc, doc, collection, getDocs, writeBatch } = await import("firebase/firestore");
      
      // Delete their session docs
      const sessSnap = await getDocs(collection(db, "users", selectedUser.uid, "sessions"));
      const batch = writeBatch(db);
      sessSnap.forEach((sessDoc) => {
        batch.delete(sessDoc.ref);
      });
      await batch.commit();

      // Delete their user profile doc
      await deleteDoc(doc(db, "users", selectedUser.uid));

      if (currentUser) {
        await logActivity(
          "Delete Team Member",
          `Deleted user profile ${editForm.email}`,
          currentUser
        );
      }

      showToast("✅ Member profile deleted successfully!");
      const updatedList = await getUsers();
      setUsers(updatedList);
      setSelectedUser(null);
    } catch (err: any) {
      showToast("❌ Delete failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      <div className="page-header animate-fade">
        <div><h1 className="page-title">Team Management</h1><p className="page-subtitle">All members loaded live from Firebase Auth + Firestore.</p></div>
        <div className="page-actions" style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowManualRegister(true)}>➕ Register Member Manually</button>
          <button className="btn btn-primary" onClick={() => { setShowInviteGenerator(true); setGeneratedLink(""); }}>🔗 Generate Invite Link</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }} className="animate-fade">
        {loading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          [
            { label: "Total Members", value: String(users.length), icon: "👥", color: "icon-purple" },
            { label: "Head Editors", value: String(heads.length), icon: "⭐", color: "icon-blue" },
            { label: "Editors", value: String(editors.length), icon: "✏️", color: "icon-green" },
            { label: "Clients", value: String(clients.length), icon: "💼", color: "icon-amber" },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
              <div className="stat-bottom"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
            </div>
          ))
        )}
      </div>

      <div className="section-card animate-fade">
        <div className="section-header">
          <div><div className="section-title">All Members</div><div className="section-subtitle">From Firestore users collection</div></div>
          <div className="search-wrap" style={{ width: 260 }}>
            <span className="search-icon">🔍</span>
            <input className="crm-input" placeholder="Search by name or role…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Member</th><th>Email</th><th>Whatsapp</th><th>Role</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">No members yet</div><div className="empty-desc">Share the invite link to add team members.</div></div></td></tr>
                ) : filtered.map(u => (
                  <tr key={u.uid}>
                    <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: 13, flexShrink: 0 }}>{(u.name || u.email)?.[0]?.toUpperCase()}</div>
                      <span className="cell-strong">{u.name || "—"}</span>
                    </div></td>
                    <td style={{ fontSize: 13 }}>{u.email}</td>
                    <td style={{ fontSize: 13 }}>{u.whatsappNumber || "—"}</td>
                    <td><span className={`badge ${roleBadge[u.role] || "badge-blue"}`}>{roleLabel[u.role] || u.role}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(u)}>✏️ Edit Profile</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(u.email); showToast("Email copied"); }}>Copy Email</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {selectedUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "95vh", overflow: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Edit Team Member Profile</div>
              <button onClick={() => setSelectedUser(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleSave} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="crm-input" required value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input className="crm-input" type="email" required value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Number</label>
                <input className="crm-input" placeholder="e.g. +91 99887 76655" value={editForm.whatsappNumber} onChange={e => setEditForm(f => ({ ...f, whatsappNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">System Role</label>
                <select className="crm-input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as any }))}>
                  <option value="editor">Editor</option>
                  <option value="head_editor">Head Editor</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editForm.role === "editor" && (
                <div className="form-group animate-fade">
                  <label className="form-label">Assigned Head Editor (Sourced By)</label>
                  <select className="crm-input" value={editForm.sourced_by} onChange={e => setEditForm(f => ({ ...f, sourced_by: e.target.value }))}>
                    <option value="">No Head Editor</option>
                    {heads.map(h => <option key={h.uid} value={h.uid}>{h.name || h.email}</option>)}
                  </select>
                </div>
              )}

              {editForm.role === "client" && (
                <div className="form-group animate-fade">
                  <label className="form-label">Assigned Editor</label>
                  <select className="crm-input" value={editForm.sourced_by} onChange={e => setEditForm(f => ({ ...f, sourced_by: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {editors.map(ed => <option key={ed.uid} value={ed.uid}>{ed.name || ed.email}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <input
                  type="checkbox"
                  id="banCheckbox"
                  checked={editForm.isBanned}
                  onChange={e => setEditForm(f => ({ ...f, isBanned: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: "var(--red)" }}
                />
                <label htmlFor="banCheckbox" style={{ fontWeight: 600, color: "var(--red)", cursor: "pointer" }}>
                  Ban User (Revoke Access & Sign Out of All Devices)
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={handleDeleteMember} style={{ color: "var(--red)", borderColor: "rgba(239,68,68,0.2)" }} disabled={saving}>
                  Delete User
                </button>
                <div style={{ display: "flex", gap: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedUser(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving Changes..." : "Save Profile"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Generator Modal */}
      {showInviteGenerator && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "95vh", overflow: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Generate Dynamic Invite Link</div>
              <button onClick={() => setShowInviteGenerator(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            
            {!generatedLink ? (
              <form onSubmit={handleGenerateInvite} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Target Member Role</label>
                  <select className="crm-input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                    <option value="editor">Editor</option>
                    <option value="head_editor">Head Editor</option>
                    <option value="client">Client</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Link Expiry Duration</label>
                  <select className="crm-input" value={inviteExpiry} onChange={e => setInviteExpiry(e.target.value)}>
                    <option value="1">1 Hour</option>
                    <option value="12">12 Hours</option>
                    <option value="24">24 Hours (1 day)</option>
                    <option value="168">7 Days (1 week)</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowInviteGenerator(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={generating}>
                    {generating ? "Generating..." : "Generate Invite Link"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: 12, fontSize: 13, color: "#34d399", textAlign: "center" }}>
                  ✅ Dynamic link generated! This link is valid only for the selected duration and role.
                </div>
                
                <div className="form-group">
                  <label className="form-label">Invitation Link</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="crm-input" readOnly value={generatedLink} style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(generatedLink); showToast("✅ Copied to clipboard!"); }}>
                      Copy
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowInviteGenerator(false)}>Close</button>
                  <button type="button" className="btn btn-primary" onClick={() => setGeneratedLink("")}>Create Another</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual User Registration Modal */}
      {showManualRegister && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "95vh", overflow: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Register Member Manually</div>
              <button onClick={() => setShowManualRegister(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleManualRegister} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="crm-input" required placeholder="e.g. John Doe" value={registerForm.name} onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input className="crm-input" type="email" required placeholder="e.g. member@skillbridge.in" value={registerForm.email} onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="crm-input" type="password" required placeholder="Min 6 characters" minLength={6} value={registerForm.password} onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Number</label>
                <input className="crm-input" placeholder="e.g. +91 99887 76655" value={registerForm.whatsappNumber} onChange={e => setRegisterForm(f => ({ ...f, whatsappNumber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">System Role</label>
                <select className="crm-input" value={registerForm.role} onChange={e => setRegisterForm(f => ({ ...f, role: e.target.value as any }))}>
                  <option value="editor">Editor</option>
                  <option value="head_editor">Head Editor</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {registerForm.role === "editor" && (
                <div className="form-group animate-fade">
                  <label className="form-label">Assigned Head Editor (Sourced By)</label>
                  <select className="crm-input" value={registerForm.sourced_by} onChange={e => setRegisterForm(f => ({ ...f, sourced_by: e.target.value }))}>
                    <option value="">No Head Editor</option>
                    {heads.map(h => <option key={h.uid} value={h.uid}>{h.name || h.email}</option>)}
                  </select>
                </div>
              )}

              {registerForm.role === "client" && (
                <div className="form-group animate-fade">
                  <label className="form-label">Assigned Editor</label>
                  <select className="crm-input" value={registerForm.assignedEditorUid} onChange={e => setRegisterForm(f => ({ ...f, assignedEditorUid: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {editors.map(ed => <option key={ed.uid} value={ed.uid}>{ed.name || ed.email}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowManualRegister(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={registering}>
                  {registering ? "Registering..." : "Register User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
