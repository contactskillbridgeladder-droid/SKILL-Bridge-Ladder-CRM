"use client";
import { useState, useEffect } from "react";
import { subscribeAllTasks, getUsers, Task } from "@/lib/firestore";
import { StatSkeleton, TableSkeleton } from "@/components/Skeletons";

const statusMap: Record<string, string> = {
  "Open": "badge-blue", "Pending": "badge-amber", "In Progress": "badge-purple",
  "In Review": "badge-amber", "Approved": "badge-green", "Rejected": "badge-red",
};

export default function AdminDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = subscribeAllTasks(t => { setTasks(t); setLoading(false); });
    getUsers().then(u => setUserCount(u.length));
    return unsub;
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };



  const filtered = tasks.filter(t => {
    const q = search.toLowerCase();
    return !q || [t.title, t.channel, t.editorName].some(v => v?.toLowerCase().includes(q));
  });

  const activeTasks = tasks.filter(t => !["Approved", "Rejected"].includes(t.status)).length;
  const inReview = tasks.filter(t => t.status === "In Review").length;
  const totalRevenue = tasks.filter(t => t.status === "Approved").reduce((a, t) => a + (t.adminEarning || 0), 0);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {toast && <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      <div className="page-header animate-fade">
        <div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>{greeting}, Veer 👋</p>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Live overview from Firebase Firestore.</p>
        </div>
        <div className="page-actions">
          <a href="/admin/tasks" className="btn btn-primary" style={{ textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Task
          </a>
        </div>
      </div>

      <div className="stats-grid">
        {loading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : [
          { label: "Active Tasks", value: String(activeTasks), delta: `${tasks.length} total`, up: true, icon: "📋", color: "icon-purple" },
          { label: "Team Members", value: String(userCount), delta: "from Firebase Auth", up: true, icon: "👥", color: "icon-blue" },
          { label: "Admin Revenue", value: totalRevenue > 0 ? `₹${totalRevenue.toLocaleString("en-IN")}` : "₹0", delta: "from approved tasks", up: true, icon: "💰", color: "icon-green" },
          { label: "Pending Review", value: String(inReview), delta: "needs attention", up: inReview === 0, icon: "⏳", color: "icon-amber" },
        ].map((s, i) => (
          <div key={s.label} className={`stat-card animate-fade anim-delay-${i + 1}`}>
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
              <div className={`stat-delta ${s.up ? "delta-up" : "delta-down"}`}>{s.up ? "↑" : "↓"} {s.delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card animate-fade">
        <div className="section-header">
          <div>
            <div className="section-title">Recent Tasks</div>
            <div className="section-subtitle">{filtered.length} tasks — live from Firestore</div>
          </div>
          <div className="search-wrap" style={{ width: 260 }}>
            <span className="search-icon">🔍</span>
            <input className="crm-input" placeholder="Search tasks, editors…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead><tr><th>Task</th><th>Channel</th><th>Type</th><th>Editor</th><th>Status</th><th>Price</th><th>Due</th></tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-icon">📋</div>
                      <div className="empty-title">No tasks yet</div>
                      <div className="empty-desc">Go to Tasks → New Task to create your first task.</div>
                    </div>
                  </td></tr>
                ) : filtered.slice(0, 10).map(t => (
                  <tr key={t.id}>
                    <td><span className="cell-strong">{t.title}</span></td>
                    <td><span className="channel-pill">{t.channel}</span></td>
                    <td><span className={`badge ${t.type === "Shorts" ? "badge-blue" : "badge-purple"}`}>{t.type}</span></td>
                    <td style={{ color: t.editorName === "Unassigned" ? "var(--text-muted)" : "inherit", fontStyle: t.editorName === "Unassigned" ? "italic" : "normal" }}>{t.editorName}</td>
                    <td><span className={`badge ${statusMap[t.status] || "badge-blue"}`}>{t.status}</span></td>
                    <td><span style={{ fontWeight: 600, color: "var(--green)" }}>₹{t.adminPrice?.toLocaleString("en-IN")}</span></td>
                    <td style={{ color: t.due === "Today" ? "var(--amber)" : "var(--text-dim)" }}>{t.due}</td>
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
