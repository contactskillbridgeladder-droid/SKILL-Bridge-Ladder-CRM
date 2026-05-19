"use client";
import { useState, useEffect } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { subscribeEditorTasks, Task, UserProfile } from "@/lib/firestore";
import { StatSkeleton, TableSkeleton } from "@/components/Skeletons";
import Link from "next/link";

export default function EditorDashboard() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;

    initFirebase().then(({ auth, db }) => {
      unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const { doc, getDoc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setCurrentUser(snap.data() as UserProfile);
          }
          
          unsubTasks = subscribeEditorTasks(user.uid, (loadedTasks) => {
            setTasks(loadedTasks);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      });
    });

    return () => {
      unsubAuth?.();
      unsubTasks?.();
    };
  }, []);

  const activeTasks = tasks.filter(t => t.status !== "Approved" && t.status !== "Rejected");
  const completedTasks = tasks.filter(t => t.status === "Approved");
  const totalEarnings = completedTasks.reduce((sum, t) => sum + (Number(t.editorPay) || 0), 0);
  const feedbackCount = tasks.filter(t => t.status === "Rejected").length;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>My Dashboard</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Loading your metrics...</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <TableSkeleton rows={3} cols={6} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Welcome back, {currentUser?.name || "Editor"} 👋</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Your live assigned tasks and earnings overview.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {[
          { label: "Active Tasks", value: String(activeTasks.length), icon: "📋", color: "icon-purple" },
          { label: "Completed", value: String(completedTasks.length), icon: "✅", color: "icon-green" },
          { label: "My Earnings", value: `₹${totalEarnings.toLocaleString()}`, icon: "💰", color: "icon-blue" },
          { label: "Rejected / Corrections", value: String(feedbackCount), icon: "💬", color: "icon-amber" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`} style={{ fontSize: 20 }}>{s.icon}</div>
            <div className="stat-bottom">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-card animate-fade" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>My Assigned Tasks</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Only showing tasks assigned directly to you</p>
          </div>
          <Link href="/editor/tasks" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
            View Detailed Tasks
          </Link>
        </div>
        
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>My Pay</th>
                <th>Due Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state" style={{ padding: "40px 20px" }}>
                      <div className="empty-icon">📋</div>
                      <div className="empty-title">No tasks assigned yet</div>
                      <div className="empty-desc">You'll see your assigned tasks and edit links here.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                tasks.slice(0, 5).map(t => (
                  <tr key={t.id}>
                    <td>
                      <div>
                        <span className="cell-strong" style={{ fontSize: 13 }}>{t.title}</span>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.channel}</div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.type === "Shorts" ? "badge-blue" : "badge-purple"}`}>
                        {t.type}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        t.status === "Approved" ? "badge-green" :
                        t.status === "Rejected" ? "badge-red" :
                        t.status === "In Review" ? "badge-purple" : "badge-amber"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--green)" }}>
                      ₹{t.editorPay?.toLocaleString() || "0"}
                    </td>
                    <td style={{ color: t.due ? "var(--text)" : "var(--text-dim)" }}>
                      {t.due || "No date"}
                    </td>
                    <td>
                      <Link href="/editor/tasks" className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
