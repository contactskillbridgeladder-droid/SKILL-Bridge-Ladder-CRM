"use client";
import { useState, useEffect } from "react";
import { getUsers, UserProfile } from "@/lib/firestore";

const roleLabel: Record<string, string> = { editor: "Editor", head_editor: "Head Editor", admin: "Admin" };
const roleBadge: Record<string, string> = { editor: "badge-blue", head_editor: "badge-purple", admin: "badge-green" };

export default function AdminTeam() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    getUsers().then(u => { setUsers(u); setLoading(false); });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const filtered = users.filter(u => !search || [u.name, u.email, u.role].some(v => v?.toLowerCase().includes(search.toLowerCase())));
  const editors = users.filter(u => u.role === "editor");
  const heads = users.filter(u => u.role === "head_editor");
  const active = users.length;

  const copyInvite = () => {
    navigator.clipboard.writeText("https://crm.skillbridgeladder.in/login?invite=SKILLBRIDGE2026");
    showToast("✅ Invite link copied!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      <div className="page-header animate-fade">
        <div><h1 className="page-title">Team</h1><p className="page-subtitle">All members loaded live from Firebase Auth + Firestore.</p></div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={copyInvite}>🔗 Copy Invite Link</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }} className="animate-fade">
        {[
          { label: "Total Members", value: String(users.length), icon: "👥", color: "icon-purple" },
          { label: "Head Editors", value: String(heads.length), icon: "⭐", color: "icon-blue" },
          { label: "Editors", value: String(editors.length), icon: "✏️", color: "icon-green" },
          { label: "Active", value: String(active), icon: "✅", color: "icon-amber" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom"><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
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
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading from Firebase…</div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
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
                    <td><span className={`badge ${roleBadge[u.role] || "badge-blue"}`}>{roleLabel[u.role] || u.role}</span></td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{u.createdAt?.toDate?.()?.toLocaleDateString("en-IN") || "—"}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(u.email); showToast("Email copied"); }}>Copy Email</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
