"use client";
import { useState, useEffect } from "react";
import { getChannels, createChannel, updateChannel, deleteChannel, Channel } from "@/lib/firestore";

export default function AdminChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    name: "",
    handle: "",
    niche: "Tech",
    type: "Main+Shorts",
    youtubeUrl: "",
    active: true
  });

  useEffect(() => {
    getChannels().then(c => {
      setChannels(c);
      setLoading(false);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const startAdd = () => {
    setEditingChannel(null);
    setForm({
      name: "",
      handle: "",
      niche: "Tech",
      type: "Main+Shorts",
      youtubeUrl: "",
      active: true
    });
    setShowModal(true);
  };

  const startEdit = (c: Channel) => {
    setEditingChannel(c);
    setForm({
      name: c.name,
      handle: c.handle,
      niche: c.niche || "Tech",
      type: c.type || "Main+Shorts",
      youtubeUrl: c.youtubeUrl || "",
      active: c.active !== undefined ? c.active : true
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingChannel && editingChannel.id) {
        await updateChannel(editingChannel.id, form);
        showToast("✅ Channel updated!");
      } else {
        await createChannel(form);
        showToast("✅ Channel added!");
      }
      const fresh = await getChannels();
      setChannels(fresh);
      setShowModal(false);
    } catch (err: any) {
      showToast("❌ " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this channel?")) return;
    try {
      await deleteChannel(id);
      setChannels(prev => prev.filter(c => c.id !== id));
      showToast("🗑️ Channel deleted!");
    } catch (err: any) {
      showToast("❌ Error: " + err.message);
    }
  };

  const nicheIcon: Record<string, string> = {
    Tech: "💻",
    Lifestyle: "🌟",
    Fitness: "💪",
    Finance: "💰",
    Travel: "✈️",
    Gaming: "🎮",
    Education: "📚",
    Other: "📺"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          background: "var(--bg-card)",
          border: "1px solid var(--border-bright)",
          borderRadius: 10,
          padding: "12px 20px",
          fontSize: 14,
          fontWeight: 500,
          zIndex: 100,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
        }}>
          {toast}
        </div>
      )}

      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Channels</h1>
          <p className="page-subtitle">YouTube clients under management — stored in Firestore.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={startAdd}>+ Add Channel</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading channels…</div>
      ) : channels.length === 0 ? (
        <div className="section-card" style={{ padding: 60 }}>
          <div className="empty-state">
            <div className="empty-icon">📺</div>
            <div className="empty-title">No channels yet</div>
            <div className="empty-desc">Click "Add Channel" to onboard your first YouTube client.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 20 }}>
          {channels.map(c => (
            <div key={c.id} className="section-card animate-fade" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "linear-gradient(135deg,#1e3a5f,#3b82f6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  flexShrink: 0
                }}>
                  {nicheIcon[c.niche] || nicheIcon.Other}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--blue)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.handle}</div>
                </div>
                <span className={`badge ${c.active ? "badge-green" : "badge-red"}`}>{c.active ? "Live" : "Paused"}</span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[{ l: "Niche", v: c.niche }, { l: "Type", v: c.type }].map(item => (
                  <div key={item.l} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{item.v}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {c.youtubeUrl && (
                  <a
                    href={c.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
                  >
                    View YouTube ↗
                  </a>
                )}
                <button
                  onClick={() => startEdit(c)}
                  className="btn btn-secondary btn-sm"
                  style={{ minWidth: 44, padding: 0, justifyContent: "center" }}
                  title="Edit Channel"
                >
                  ✏️
                </button>
                <button
                  onClick={() => c.id && handleDelete(c.id)}
                  className="btn btn-secondary btn-sm"
                  style={{ minWidth: 44, padding: 0, justifyContent: "center", borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                  title="Delete Channel"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {editingChannel ? "Edit Channel" : "Add New Channel"}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Channel Name *</label>
                <input className="crm-input" required placeholder="TechWithRaj" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              
              <div className="form-group">
                <label className="form-label">Handle *</label>
                <input className="crm-input" required placeholder="@TechWithRaj" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} />
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Niche</label>
                  <select className="crm-input" value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}>
                    {["Tech", "Lifestyle", "Fitness", "Finance", "Travel", "Gaming", "Education", "Other"].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Service Type</label>
                  <select className="crm-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="Main Edit">Main Edit</option>
                    <option value="Shorts">Shorts</option>
                    <option value="Main+Shorts">Main + Shorts</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">YouTube URL</label>
                <input className="crm-input" placeholder="https://youtube.com/@..." value={form.youtubeUrl} onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))} />
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                <input
                  type="checkbox"
                  id="active-checkbox"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: "#7c3aed" }}
                />
                <label htmlFor="active-checkbox" className="form-label" style={{ margin: 0, cursor: "pointer" }}>Channel is active / live</label>
              </div>
              
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? "Saving…" : editingChannel ? "Save Changes" : "Add Channel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
