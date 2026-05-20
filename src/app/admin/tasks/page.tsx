"use client";
import { useState, useEffect } from "react";
import { subscribeAllTasks, createTask, updateTask, getUsers, getChannels, Task, UserProfile, Channel } from "@/lib/firestore";
import { initFirebase } from "@/lib/firebase";
import { TableSkeleton } from "@/components/Skeletons";

const statusMap: Record<string, string> = {
  "Open": "badge-blue", "Pending": "badge-amber", "In Progress": "badge-purple",
  "In Review": "badge-amber", "Approved": "badge-green", "Rejected": "badge-red",
};

export default function AdminTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // New Task Form
  const [form, setForm] = useState({
    title: "", channelId: "", type: "Main Edit" as "Main Edit" | "Shorts",
    editorUid: "", headEditorUid: "", adminPrice: "", editorPay: "", headPay: "",
    youtubeUrl: "", notes: "", due: "",
  });

  useEffect(() => {
    // Real-time task subscription
    const unsub = subscribeAllTasks(data => { setTasks(data); setLoading(false); });
    // Load users + channels once
    getUsers().then(setUsers);
    getChannels().then(setChannels);
    return unsub;
  }, []);

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || [t.title, t.channel, t.editorName].some(v => v?.toLowerCase().includes(q));
    const matchType = typeFilter === "All" || t.type === typeFilter;
    const matchStatus = statusFilter === "All" || t.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const editors = users.filter(u => u.role === "editor");
  const headEditors = users.filter(u => u.role === "head_editor");

  const handleEditClick = (t: Task) => {
    setEditingTask(t);
    setForm({
      title: t.title, channelId: t.channelId, type: t.type,
      editorUid: t.editorUid || "", headEditorUid: t.headEditorUid || "",
      adminPrice: String(t.adminPrice), editorPay: String(t.editorPay), headPay: String(t.headPay),
      youtubeUrl: t.youtubeUrl, notes: t.notes, due: t.due
    });
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingTask) {
        // Find assigned editor names for UI
        const assignedEditor = users.find(u => u.uid === form.editorUid);
        const adminEarning = parseFloat(form.adminPrice) - parseFloat(form.editorPay) - parseFloat(form.headPay);

        await updateTask(editingTask.id!, {
          title: form.title, channelId: form.channelId, type: form.type,
          editorUid: form.editorUid || null, headEditorUid: form.headEditorUid || null,
          editorName: assignedEditor ? assignedEditor.name : "Unassigned",
          adminPrice: parseFloat(form.adminPrice) || 0,
          editorPay: parseFloat(form.editorPay) || 0,
          headPay: parseFloat(form.headPay) || 0,
          adminEarning, youtubeUrl: form.youtubeUrl, notes: form.notes, due: form.due
        });
        showToast("✅ Task updated successfully");
      } else {
        // Call /api/video-ticket — creates task + auto-notifies head editor + all subordinate editors
        const res = await fetch("/api/video-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: form.channelId,
          videoTitle: form.title,
          youtubeUrl: form.youtubeUrl,
          type: form.type,
          notes: form.notes,
          due: form.due,
          adminPrice: parseFloat(form.adminPrice) || 0,
          editorPay: parseFloat(form.editorPay) || 0,
          headPay: parseFloat(form.headPay) || 0,
          headEditorUid: form.headEditorUid || null,
          editorUid: form.editorUid || null,
        }),
      });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        showToast(`✅ Task created! Notified ${data.notifiedCount} team member(s) via FCM + email`);
      }

      setShowModal(false);
      setEditingTask(null);
      setForm({ title: "", channelId: "", type: "Main Edit", editorUid: "", headEditorUid: "", adminPrice: "", editorPay: "", headPay: "", youtubeUrl: "", notes: "", due: "" });
    } catch (err: any) {
      showToast("❌ " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: Task["status"]) => {
    await updateTask(id, { status });
    showToast("Status updated");
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}

      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">All editing tasks across channels and team members — live from Firebase.</p>
        </div>
        <div className="page-actions" style={{ display: "flex", gap: 10 }}>
          <a href="/admin/video-ai" className="btn btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>⚡ AI Analyzer</span>
          </a>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="animate-fade" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="search-wrap" style={{ width: 280 }}>
          <span className="search-icon">🔍</span>
          <input className="crm-input" placeholder="Search tasks, editors…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="crm-input" style={{ width: "auto" }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          <option value="Main Edit">Main Edit</option>
          <option value="Shorts">Shorts</option>
        </select>
        <select className="crm-input" style={{ width: "auto" }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          {["Open", "Pending", "In Progress", "In Review", "Approved", "Rejected"].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filtered.length} tasks</span>
      </div>

      {/* Table */}
      <div className="section-card animate-fade">
        {loading ? (
          <TableSkeleton rows={8} cols={9} />
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>ID</th><th>Task</th><th>Channel</th><th>Type</th><th>Editor</th><th>Status</th><th>Price</th><th>Due</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">No tasks yet</div><div className="empty-desc">Click "New Task" to create the first one.</div></div></td></tr>
                ) : filtered.map(t => (
                  <tr key={t.id}>
                    <td><span className="cell-mono">{t.taskNumber || t.id?.slice(0, 6)}</span></td>
                    <td><span className="cell-strong">{t.title}</span></td>
                    <td><span className="channel-pill">{t.channel}</span></td>
                    <td><span className={`badge ${t.type === "Shorts" ? "badge-blue" : "badge-purple"}`}>{t.type}</span></td>
                    <td style={{ color: t.editorName === "Unassigned" ? "var(--text-muted)" : "var(--text-dim)", fontStyle: t.editorName === "Unassigned" ? "italic" : "normal" }}>{t.editorName}</td>
                    <td>
                      <select
                        value={t.status}
                        onChange={e => handleStatusChange(t.id!, e.target.value as Task["status"])}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontSize: 12, outline: "none" }}
                      >
                        <option value={t.status}>{t.status}</option>
                        {["Open", "Pending", "In Progress", "In Review", "Approved", "Rejected"].filter(s => s !== t.status).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td><span style={{ fontWeight: 600, color: "var(--green)" }}>₹{t.adminPrice?.toLocaleString("en-IN")}</span></td>
                    <td style={{ color: t.due === "Today" ? "var(--amber)" : "var(--text-dim)" }}>{t.due}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleEditClick(t)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleStatusChange(t.id!, "Approved")} disabled={t.status === "Approved"}>Approve</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{editingTask ? "Edit Task" : "Create New Task"}</div>
              <button onClick={() => { setShowModal(false); setEditingTask(null); setForm({ title: "", channelId: "", type: "Main Edit", editorUid: "", headEditorUid: "", adminPrice: "", editorPay: "", headPay: "", youtubeUrl: "", notes: "", due: "" }); }} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input className="crm-input" required placeholder="e.g. Main Edit – Tech Channel S3E01" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Channel *</label>
                  <select className="crm-input" required value={form.channelId} onChange={e => setForm(f => ({ ...f, channelId: e.target.value }))}>
                    <option value="">Select channel…</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.handle}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select className="crm-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                    <option value="Main Edit">Main Edit</option>
                    <option value="Shorts">Shorts</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Assign Editor</label>
                  <select className="crm-input" value={form.editorUid} onChange={e => setForm(f => ({ ...f, editorUid: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {editors.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Head Editor</label>
                  <select className="crm-input" value={form.headEditorUid} onChange={e => setForm(f => ({ ...f, headEditorUid: e.target.value }))}>
                    <option value="">None</option>
                    {headEditors.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Total Price (₹)</label>
                  <input className="crm-input" type="number" placeholder="3000" value={form.adminPrice} onChange={e => setForm(f => ({ ...f, adminPrice: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Editor Pay (₹)</label>
                  <input className="crm-input" type="number" placeholder="2500" value={form.editorPay} onChange={e => setForm(f => ({ ...f, editorPay: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Head Pay (₹)</label>
                  <input className="crm-input" type="number" placeholder="200" value={form.headPay} onChange={e => setForm(f => ({ ...f, headPay: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">YouTube / Reference URL</label>
                <input className="crm-input" placeholder="https://youtube.com/watch?v=..." value={form.youtubeUrl} onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Due</label>
                  <input className="crm-input" placeholder="e.g. 3 days" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input className="crm-input" placeholder="Any special instructions…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingTask(null); setForm({ title: "", channelId: "", type: "Main Edit", editorUid: "", headEditorUid: "", adminPrice: "", editorPay: "", headPay: "", youtubeUrl: "", notes: "", due: "" }); }}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving…" : (editingTask ? "Save Changes" : "Create Task & Notify")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
