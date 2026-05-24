"use client";
import React, { useState, useEffect } from "react";
import { getUsers, updateUserProfile, logActivity, UserProfile } from "@/lib/firestore";
import { initFirebase } from "@/lib/firebase";
import { StatSkeleton, TableSkeleton } from "@/components/Skeletons";

export default function AdminShifting() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [currentUser, setCurrentUser] = useState<{ uid: string; name: string; email: string } | null>(null);
  const [updatingClientId, setUpdatingClientId] = useState<string | null>(null);

  useEffect(() => {
    // Get current logged-in admin
    initFirebase().then(async ({ auth }) => {
      const u = auth.currentUser;
      if (u) {
        setCurrentUser({
          uid: u.uid,
          name: u.displayName || "Admin",
          email: u.email || "hr@skillbridgeladder.in"
        });
      }
    });

    getUsers().then(u => {
      setUsers(u);
      setLoading(false);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const editors = users.filter(u => u.role === "editor");
  const clients = users.filter(u => u.role === "client" && 
    (!search || [u.name, u.email].some(v => v?.toLowerCase().includes(search.toLowerCase()))));

  const handleEditorChange = async (clientId: string, editorUid: string) => {
    setUpdatingClientId(clientId);
    try {
      const client = users.find(u => u.uid === clientId);
      const editor = users.find(u => u.uid === editorUid);

      await updateUserProfile(clientId, {
        assignedEditorUid: editorUid || ""
      });

      // Update local state
      setUsers(prev => prev.map(u => u.uid === clientId ? { ...u, assignedEditorUid: editorUid } : u));

      if (currentUser && client) {
        await logActivity(
          "Shift Client Assignment",
          `Assigned Client ${client.email} to Editor ${editor ? editor.email : "Unassigned"}`,
          currentUser
        );
      }

      showToast("✅ Client shifted successfully!");
    } catch (err: any) {
      showToast("❌ Failed to shift client: " + err.message);
    } finally {
      setUpdatingClientId(null);
    }
  };

  const handleToggleAIScanner = async (clientId: string, currentStatus: boolean) => {
    setUpdatingClientId(clientId);
    try {
      const client = users.find(u => u.uid === clientId);
      const newStatus = !currentStatus;

      await updateUserProfile(clientId, {
        aiScannerDisabled: newStatus
      } as any);

      // Update local state
      setUsers(prev => prev.map(u => u.uid === clientId ? { ...u, aiScannerDisabled: newStatus } as any : u));

      if (currentUser && client) {
        await logActivity(
          newStatus ? "Disable AI Moderation" : "Enable AI Moderation",
          `${newStatus ? "Disabled" : "Enabled"} AI link/contact checker for ${client.email}`,
          currentUser
        );
      }

      showToast(`🛡️ AI Chat Moderation is now ${newStatus ? "Disabled" : "Enabled"}!`);
    } catch (err: any) {
      showToast("❌ Failed to update AI settings: " + err.message);
    } finally {
      setUpdatingClientId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--bg-card)", border: "1px solid var(--border-bright)",
          borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500,
          zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          {toast}
        </div>
      )}

      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Client Assignments &amp; AI Shifting</h1>
          <p className="page-subtitle">Shift client assignments between editors, toggle security filters, and audit blocked information loops.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }} className="animate-fade">
        {loading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          [
            { label: "Assigned Clients", value: String(users.filter(u => u.role === "client" && u.assignedEditorUid).length), icon: "⚡", color: "icon-purple" },
            { label: "Unassigned Clients", value: String(users.filter(u => u.role === "client" && !u.assignedEditorUid).length), icon: "⚠️", color: "icon-amber" },
            { label: "Total Editors Available", value: String(editors.length), icon: "✏️", color: "icon-green" },
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
          <div>
            <div className="section-title">Client-Editor Shifting Matrix</div>
            <div className="section-subtitle">Real-time automatic proxy routing mapping</div>
          </div>
          <div className="search-wrap" style={{ width: 260 }}>
            <span className="search-icon">🔍</span>
            <input className="crm-input" placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Client Profile</th>
                  <th>Assigned Editor (Proxy Partner)</th>
                  <th>AI Content Check</th>
                  <th>Filter Metric</th>
                  <th>Shifting Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <div className="empty-icon">💼</div>
                        <div className="empty-title">No clients found</div>
                        <div className="empty-desc">Create invite links for clients to register and start shifting.</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  clients.map(c => {
                    const assignedEditor = editors.find(ed => ed.uid === c.assignedEditorUid);
                    const aiDisabled = (c as any).aiScannerDisabled === true;
                    const blockedCount = (c as any).blockedMessagesCount || 0;

                    return (
                      <tr key={c.uid}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: "linear-gradient(135deg,#ec4899,#8b5cf6)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 700, color: "white", fontSize: 13, flexShrink: 0
                            }}>
                              {(c.name || c.email)?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <span className="cell-strong">{c.name || "—"}</span>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{c.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            className="crm-input"
                            style={{ maxWidth: 220, fontSize: 12.5, height: 36, padding: "0 10px" }}
                            value={c.assignedEditorUid || ""}
                            onChange={e => handleEditorChange(c.uid, e.target.value)}
                            disabled={updatingClientId === c.uid}
                          >
                            <option value="">⚠️ Select Editor to Assign</option>
                            {editors.map(ed => (
                              <option key={ed.uid} value={ed.uid}>
                                {ed.name || ed.email} ({ed.email})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            onClick={() => handleToggleAIScanner(c.uid, aiDisabled)}
                            disabled={updatingClientId === c.uid}
                            className={`btn btn-sm ${aiDisabled ? "btn-secondary" : "btn-primary"}`}
                            style={{
                              borderRadius: 8, fontSize: 11.5, padding: "5px 12px",
                              background: aiDisabled ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                              color: aiDisabled ? "#ef4444" : "#10b981",
                              border: aiDisabled ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.3)"
                            }}
                          >
                            {aiDisabled ? "🛡️ AI Bypass" : "🛡️ AI Active"}
                          </button>
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: blockedCount > 0 ? "#ef4444" : "var(--text-muted)", fontWeight: 600 }}>
                            {blockedCount} attempts blocked
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11.5,
                            color: c.assignedEditorUid ? "var(--green)" : "var(--text-muted)"
                          }}>
                            {c.assignedEditorUid ? "● Shifting Configured" : "○ Awaiting Partner"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
