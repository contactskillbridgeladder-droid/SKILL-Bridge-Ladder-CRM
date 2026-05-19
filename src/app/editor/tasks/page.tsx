"use client";
import { useState, useEffect } from "react";
import { subscribeEditorTasks, updateTask, Task } from "@/lib/firestore";
import { initFirebase } from "@/lib/firebase";

const statusMap: Record<string, string> = {
  "In Progress": "badge-purple", "In Review": "badge-amber",
  "Approved": "badge-green", "Rejected": "badge-red", "Open": "badge-blue",
};

export default function EditorTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitLinks, setSubmitLinks] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    initFirebase().then(({ auth }) => {
      const user = auth.currentUser;
      if (!user) return;
      setUid(user.uid);
      const unsub = subscribeEditorTasks(user.uid, data => { setTasks(data); setLoading(false); });
      return unsub;
    });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleSubmit = async (task: Task) => {
    const link = submitLinks[task.id!];
    if (!link) return showToast("Please paste your submission link first.");
    setSubmitting(task.id!);
    try {
      await updateTask(task.id!, { submissionLink: link, status: "In Review" });
      showToast("✅ Work submitted! Status set to In Review.");
      setExpandedId(null);
    } catch (err: any) { showToast("❌ " + err.message); }
    finally { setSubmitting(null); }
  };

  const active = tasks.filter(t => t.status !== "Approved" && t.status !== "Rejected");
  const done = tasks.filter(t => t.status === "Approved");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      <div className="page-header animate-fade">
        <div><h1 className="page-title">My Tasks</h1><p className="page-subtitle">Real-time tasks assigned to you — submit your work directly here.</p></div>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center", color: "var(--text-muted)" }}>⏳ Loading your tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="section-card" style={{ padding: 60 }}><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">No tasks assigned yet</div><div className="empty-desc">When the admin assigns you a task, it will appear here and you'll receive an email notification.</div></div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {active.map(t => (
            <div key={t.id} className="section-card animate-fade"
              style={{ padding: 22, borderColor: expandedId === t.id ? "rgba(124,58,237,0.4)" : "var(--border)", cursor: "pointer", transition: "border-color 0.15s" }}
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id!)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span className={`badge ${t.type === "Shorts" ? "badge-blue" : "badge-purple"}`}>{t.type}</span>
                    <span className="channel-pill">{t.channel}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 6 }}>{t.title}</div>
                  {t.notes && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>📝 {t.notes}</div>}
                  {t.youtubeUrl && <a href={t.youtubeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--blue)", textDecoration: "none", display: "block", marginTop: 4 }}>🎬 Reference Video ↗</a>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <span className={`badge ${statusMap[t.status] || "badge-blue"}`}>{t.status}</span>
                  <span style={{ fontWeight: 700, color: "var(--green)", fontSize: 16 }}>₹{t.editorPay?.toLocaleString("en-IN")}</span>
                  {t.due && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Due: {t.due}</span>}
                </div>
              </div>

              {expandedId === t.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 10, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                  <input
                    className="crm-input"
                    placeholder="Paste Google Drive / YouTube link to your finished work…"
                    style={{ flex: 1, minWidth: 220 }}
                    value={submitLinks[t.id!] || ""}
                    onChange={e => setSubmitLinks(s => ({ ...s, [t.id!]: e.target.value }))}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={submitting === t.id}
                    onClick={() => handleSubmit(t)}
                  >
                    {submitting === t.id ? "Submitting…" : "Submit Work ✓"}
                  </button>
                </div>
              )}
            </div>
          ))}

          {done.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 8 }}>Completed ({done.length})</div>
              {done.map(t => (
                <div key={t.id} className="section-card" style={{ padding: 18, opacity: 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: "var(--green)" }}>₹{t.editorPay?.toLocaleString("en-IN")}</span>
                      <span className="badge badge-green">Approved</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
