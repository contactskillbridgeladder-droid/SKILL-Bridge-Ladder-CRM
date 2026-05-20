"use client";
import { useState, useEffect } from "react";
import { getChannels, createChannel, updateChannel, deleteChannel, Channel, UserProfile } from "@/lib/firestore";

export default function AdminChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  
  // Auto-fetch channel state
  const [fetchingDetails, setFetchingDetails] = useState(false);

  // Users state for task assignment
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Channel details video hub states
  const [selectedChannelForHub, setSelectedChannelForHub] = useState<Channel | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubVideos, setHubVideos] = useState<any[]>([]);
  const [hubShorts, setHubShorts] = useState<any[]>([]);
  const [hubTab, setHubTab] = useState<"long" | "short" | "custom">("long");

  // Task assignment states
  const [assigningVideo, setAssigningVideo] = useState<any | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    type: "Main Edit" as "Main Edit" | "Shorts",
    editorUid: "",
    headEditorUid: "",
    adminPrice: 0,
    editorPay: 0,
    headPay: 0,
    due: "",
    notes: "",
    youtubeUrl: ""
  });
  const [assigning, setAssigning] = useState(false);

  const [form, setForm] = useState({
    name: "",
    handle: "",
    niche: "Tech",
    type: "Main+Shorts",
    youtubeUrl: "",
    active: true,
    avatarUrl: "",
    subscriberCount: ""
  });

  useEffect(() => {
    getChannels().then(c => {
      setChannels(c);
      setLoading(false);
    });
    
    // Fetch users for task assignment dropdown
    import("@/lib/firestore").then(({ getUsers }) => {
      getUsers().then(setUsers);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAutoFetchDetails = async () => {
    if (!form.youtubeUrl.trim()) {
      showToast("⚠️ Please enter a YouTube URL or handle first!");
      return;
    }
    setFetchingDetails(true);
    try {
      const res = await fetch("/api/youtube/fetch-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.youtubeUrl })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to fetch details.");
      
      setForm(f => ({
        ...f,
        name: data.channel.name,
        handle: data.channel.handle,
        youtubeUrl: data.channel.youtubeUrl,
        avatarUrl: data.channel.avatarUrl || "",
        subscriberCount: data.channel.subscriberCount || ""
      }));
      showToast("✨ Details fetched and populated!");
    } catch (e: any) {
      showToast("❌ " + e.message);
    } finally {
      setFetchingDetails(false);
    }
  };

  const openChannelHub = async (channel: Channel) => {
    setSelectedChannelForHub(channel);
    setHubLoading(true);
    setHubVideos([]);
    setHubShorts([]);
    setHubTab("long");
    try {
      const res = await fetch("/api/youtube/fetch-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: channel.youtubeUrl || channel.handle })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to fetch channel data");
      setHubVideos(data.videos || []);
      setHubShorts(data.shorts || []);
      
      // Auto update if missing or changed
      if (channel.id && (!channel.avatarUrl || data.channel.avatarUrl !== channel.avatarUrl || data.channel.subscriberCount !== channel.subscriberCount)) {
        await updateChannel(channel.id, {
          avatarUrl: data.channel.avatarUrl,
          subscriberCount: data.channel.subscriberCount
        });
        setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, avatarUrl: data.channel.avatarUrl, subscriberCount: data.channel.subscriberCount } : c));
      }
    } catch (e: any) {
      showToast("❌ " + e.message);
    } finally {
      setHubLoading(false);
    }
  };

  const startAssign = (video: any, type: "Main Edit" | "Shorts") => {
    setAssigningVideo(video);
    setTaskForm({
      title: video.title || "",
      type: type,
      editorUid: "",
      headEditorUid: "",
      adminPrice: 0,
      editorPay: 0,
      headPay: 0,
      due: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
      notes: `YouTube Video Import\nVideo ID: ${video.videoId || ""}`,
      youtubeUrl: video.url || (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : "")
    });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelForHub) return;
    setAssigning(true);
    try {
      const selectedEditor = users.find(u => u.uid === taskForm.editorUid);
      const { createTask } = await import("@/lib/firestore");
      
      const adminPriceVal = Number(taskForm.adminPrice) || 0;
      const editorPayVal = Number(taskForm.editorPay) || 0;
      const headPayVal = Number(taskForm.headPay) || 0;
      const adminEarningVal = adminPriceVal - editorPayVal - headPayVal;

      await createTask({
        title: taskForm.title,
        channel: selectedChannelForHub.name,
        channelId: selectedChannelForHub.id || "",
        type: taskForm.type,
        editorUid: taskForm.editorUid || null,
        editorName: selectedEditor ? selectedEditor.name : "Unassigned",
        headEditorUid: taskForm.headEditorUid || null,
        status: "Open",
        adminPrice: adminPriceVal,
        editorPay: editorPayVal,
        headPay: headPayVal,
        adminEarning: adminEarningVal,
        submissionLink: "",
        youtubeUrl: taskForm.youtubeUrl,
        notes: taskForm.notes,
        due: taskForm.due,
        zohoLogged: false
      });

      // Send log & notifications
      const { logActivity } = await import("@/lib/firestore");
      const resUser = await fetch("/api/auth/me").catch(() => null);
      const me = resUser ? await resUser.json() : null;
      await logActivity("task_created", `Imported/assigned task: "${taskForm.title}" for channel "${selectedChannelForHub.name}"`, me || { uid: "admin", name: "Administrator", email: "admin@crm.com" });

      if (taskForm.editorUid) {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: taskForm.editorUid,
            title: "New Task Assigned 📋",
            message: `You have been assigned "${taskForm.title}" for channel "${selectedChannelForHub.name}".`,
            type: "task_assigned",
            ctaLink: "/editor/tasks"
          })
        }).catch(() => null);
      }
      if (taskForm.headEditorUid) {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: taskForm.headEditorUid,
            title: "New Task Assigned 📋",
            message: `New task "${taskForm.title}" for channel "${selectedChannelForHub.name}" needs supervision.`,
            type: "task_assigned",
            ctaLink: "/head-editor"
          })
        }).catch(() => null);
      }

      showToast("🚀 Task assigned successfully!");
      setAssigningVideo(null);
    } catch (err: any) {
      showToast("❌ Failed to create task: " + err.message);
    } finally {
      setAssigning(false);
    }
  };

  const startAdd = () => {
    setEditingChannel(null);
    setForm({
      name: "",
      handle: "",
      niche: "Tech",
      type: "Main+Shorts",
      youtubeUrl: "",
      active: true,
      avatarUrl: "",
      subscriberCount: ""
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
      active: c.active !== undefined ? c.active : true,
      avatarUrl: c.avatarUrl || "",
      subscriberCount: c.subscriberCount || ""
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
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt={c.name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                ) : (
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
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--blue)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.handle} {c.subscriberCount && <span style={{ color: "var(--text-muted)" }}>• {c.subscriberCount}</span>}
                  </div>
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

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => openChannelHub(c)}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, justifyContent: "center", whiteSpace: "nowrap" }}
                >
                  📺 Videos & Tasks
                </button>
                <button
                  onClick={() => startEdit(c)}
                  className="btn btn-secondary btn-sm"
                  style={{ minWidth: 38, padding: 0, justifyContent: "center" }}
                  title="Edit Channel"
                >
                  ✏️
                </button>
                <button
                  onClick={() => c.id && handleDelete(c.id)}
                  className="btn btn-secondary btn-sm"
                  style={{ minWidth: 38, padding: 0, justifyContent: "center", borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                  title="Delete Channel"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Add/Edit Channel Modal */}
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
                <label className="form-label">YouTube URL</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input className="crm-input" style={{ flex: 1 }} placeholder="https://youtube.com/@..." value={form.youtubeUrl} onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))} />
                  <button type="button" disabled={fetchingDetails} onClick={handleAutoFetchDetails} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                    {fetchingDetails ? "Fetching..." : "Auto-Fetch ⚡"}
                  </button>
                </div>
              </div>

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
                  {saving ? "Saving..." : editingChannel ? "Save Changes" : "Add Channel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel Video & Task Hub Modal */}
      {selectedChannelForHub && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 20, width: "100%", maxWidth: 840, height: "100%", maxHeight: 680, display: "flex", flexDirection: "column", boxShadow: "0 32px 100px rgba(0,0,0,0.8)", overflow: "hidden" }}>
            
            {/* Header */}
            <div style={{ padding: "24px 32px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {selectedChannelForHub.avatarUrl ? (
                  <img src={selectedChannelForHub.avatarUrl} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: "rgba(124,58,237,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📺</div>
                )}
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{selectedChannelForHub.name} Hub</h2>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                    {selectedChannelForHub.handle} • {selectedChannelForHub.subscriberCount || "0 subscribers"} • Niche: {selectedChannelForHub.niche}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedChannelForHub(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 24, cursor: "pointer" }}>✕</button>
            </div>

            {/* Tab selector */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.1)" }}>
              {[
                { id: "long", label: "Long Videos 🎬" },
                { id: "short", label: "Shorts / Reels 📱" },
                { id: "custom", label: "🆕 Custom Task Request" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setHubTab(t.id as any)}
                  style={{
                    flex: 1,
                    padding: "16px 20px",
                    background: "none",
                    border: "none",
                    borderBottom: hubTab === t.id ? "3px solid #7c3aed" : "3px solid transparent",
                    color: hubTab === t.id ? "var(--text)" : "var(--text-muted)",
                    fontWeight: hubTab === t.id ? 700 : 500,
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "all 0.15s"
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content list */}
            <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
              {hubLoading ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>⚡</div>
                  Fetching channel uploads from YouTube... Please wait.
                </div>
              ) : hubTab === "long" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {hubVideos.map(v => (
                    <div key={v.videoId} style={{ display: "flex", gap: 14, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                      <img src={v.thumbnail} alt="" style={{ width: 120, height: 75, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}>
                          {v.title}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{v.duration || "Long Video"}</span>
                          <button onClick={() => startAssign(v, "Main Edit")} className="btn btn-primary btn-sm" style={{ padding: "4px 10px", fontSize: 11 }}>
                            + Assign Task
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {hubVideos.length === 0 && (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No long videos found.</div>
                  )}
                </div>
              ) : hubTab === "short" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  {hubShorts.map(s => (
                    <div key={s.videoId} style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                      <img src={s.thumbnail} alt="" style={{ width: "100%", height: 160, objectFit: "cover" }} />
                      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.4 }}>
                          {s.title}
                        </div>
                        <button onClick={() => startAssign(s, "Shorts")} className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                          + Assign Shorts Task
                        </button>
                      </div>
                    </div>
                  ))}
                  {hubShorts.length === 0 && (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-muted)", padding: 40 }}>No YouTube Shorts found.</div>
                  )}
                </div>
              ) : (
                <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>📁</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Add custom project not yet on YouTube</h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 24 }}>
                    Create a new editing script, video idea, or package request. Hand it over directly to your editors or head editor to begin production.
                  </p>
                  <button onClick={() => {
                    setAssigningVideo({ title: "Custom Project Request", isCustom: true });
                    setTaskForm({
                      title: "",
                      type: "Main Edit",
                      editorUid: "",
                      headEditorUid: "",
                      adminPrice: 0,
                      editorPay: 0,
                      headPay: 0,
                      due: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
                      notes: "",
                      youtubeUrl: ""
                    });
                  }} className="btn btn-primary">
                    + Create Custom Project Task
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 32px", borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.15)", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setSelectedChannelForHub(null)} className="btn btn-secondary">Close Hub</button>
            </div>
          </div>
        </div>
      )}

      {/* Task Creation & Assignment Overlay Modal */}
      {assigningVideo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 540, boxShadow: "0 32px 80px rgba(0,0,0,0.7)", overflow: "hidden" }}>
            
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Assign Task: {assigningVideo.isCustom ? "Custom Project" : "YouTube Video Import"}
              </div>
              <button onClick={() => setAssigningVideo(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <form onSubmit={handleCreateTask} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
              
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input required className="crm-input" placeholder="e.g. Editing 10 secrets of coding" value={taskForm.title} onChange={e => setTaskForm(t => ({ ...t, title: e.target.value }))} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Task Type</label>
                  <select className="crm-input" value={taskForm.type} onChange={e => setTaskForm(t => ({ ...t, type: e.target.value as any }))}>
                    <option value="Main Edit">Main Edit (Long)</option>
                    <option value="Shorts">Shorts</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date *</label>
                  <input type="date" required className="crm-input" value={taskForm.due} onChange={e => setTaskForm(t => ({ ...t, due: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Assign Editor</label>
                  <select className="crm-input" value={taskForm.editorUid} onChange={e => setTaskForm(t => ({ ...t, editorUid: e.target.value }))}>
                    <option value="">Choose editor (unassigned)</option>
                    {users.filter(u => u.role === "editor").map(u => (
                      <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Assign Head Editor</label>
                  <select className="crm-input" value={taskForm.headEditorUid} onChange={e => setTaskForm(t => ({ ...t, headEditorUid: e.target.value }))}>
                    <option value="">Choose supervisor (none)</option>
                    {users.filter(u => u.role === "head_editor").map(u => (
                      <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Client Charged (₹) *</label>
                  <input type="number" required className="crm-input" placeholder="Price" value={taskForm.adminPrice || ""} onChange={e => setTaskForm(t => ({ ...t, adminPrice: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Editor Pay (₹) *</label>
                  <input type="number" required className="crm-input" placeholder="Editor" value={taskForm.editorPay || ""} onChange={e => setTaskForm(t => ({ ...t, editorPay: Number(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Head Pay (₹) *</label>
                  <input type="number" required className="crm-input" placeholder="Head" value={taskForm.headPay || ""} onChange={e => setTaskForm(t => ({ ...t, headPay: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Live net profit counter */}
              <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Admin Net Profit:</span>
                <span style={{ fontWeight: 700, color: (taskForm.adminPrice - taskForm.editorPay - taskForm.headPay) >= 0 ? "#10b981" : "#ef4444" }}>
                  ₹{(taskForm.adminPrice - taskForm.editorPay - taskForm.headPay).toFixed(2)}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Reference / YouTube URL</label>
                <input className="crm-input" placeholder="https://..." value={taskForm.youtubeUrl} onChange={e => setTaskForm(t => ({ ...t, youtubeUrl: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Special instructions / Requirements</label>
                <textarea className="crm-input" rows={3} style={{ resize: "none" }} placeholder="Enter notes..." value={taskForm.notes} onChange={e => setTaskForm(t => ({ ...t, notes: e.target.value }))}></textarea>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAssigningVideo(null)}>Cancel</button>
                <button type="submit" disabled={assigning} className="btn btn-primary">
                  {assigning ? "Assigning..." : "Assign Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
