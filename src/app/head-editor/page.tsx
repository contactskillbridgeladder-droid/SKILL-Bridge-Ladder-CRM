"use client";
import { useState, useEffect } from "react";
import { initFirebase } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getUsers, Task, UserProfile } from "@/lib/firestore";
import { StatSkeleton, TableSkeleton } from "@/components/Skeletons";
import Link from "next/link";

export default function HeadEditorDashboard() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [editors, setEditors] = useState<UserProfile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;

    initFirebase().then(({ auth, db }) => {
      unsubAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const { doc, getDoc, collection, query, where, onSnapshot } = await import("firebase/firestore");
          
          // Fetch currentUser profile
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (userSnap.exists()) {
            const profile = userSnap.data() as UserProfile;
            setCurrentUser(profile);

            // Fetch team editors
            const allUsers = await getUsers();
            const myEditors = allUsers.filter(u => u.role === "editor" && u.sourced_by === user.uid);
            setEditors(myEditors);

            // Subscribe to tasks supervised by this Head Editor
            const q = query(collection(db, "tasks"), where("headEditorUid", "==", user.uid));
            unsubTasks = onSnapshot(q, (snap) => {
              const loadedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
              setTasks(loadedTasks);
              setLoading(false);
            }, (err) => {
              console.error(err);
              setLoading(false);
            });
          } else {
            setLoading(false);
          }
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
  const pendingReview = tasks.filter(t => t.status === "In Review");
  const approvedTasks = tasks.filter(t => t.status === "Approved");
  const totalCommission = approvedTasks.reduce((sum, t) => sum + (Number(t.headPay) || 0), 0);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Head Editor Dashboard</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Loading supervise overview...</p>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }} className="animate-fade">
      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Welcome back, {currentUser?.name || "Head Editor"} 🌟</h1>
          <p className="page-subtitle">Supervise your team and track your commission live from Firestore.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }} className="animate-fade">
        {[
          { label: "My Editors", value: String(editors.length), icon: "👥", color: "icon-blue" },
          { label: "Active Tasks", value: String(activeTasks.length), icon: "📋", color: "icon-purple" },
          { label: "My Commission", value: `₹${totalCommission.toLocaleString()}`, icon: "💰", color: "icon-green" },
          { label: "Pending Review", value: String(pendingReview.length), icon: "⏳", color: "icon-amber" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon-wrap ${s.color}`}>{s.icon}</div>
            <div className="stat-bottom">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        {/* Tasks Table */}
        <div className="section-card animate-fade" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="section-title">Tasks Under Supervision</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Tasks assigned to editors you sourced</p>
            </div>
            <Link href="/head-editor/tasks" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
              View All
            </Link>
          </div>
          
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Type</th>
                  <th>Editor</th>
                  <th>Status</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state" style={{ padding: "40px 20px" }}>
                        <div className="empty-icon">📋</div>
                        <div className="empty-title">No supervised tasks</div>
                        <div className="empty-desc">Tasks assigned by admin to your editors will show here.</div>
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
                      <td style={{ fontSize: 13 }}>{t.editorName || "Unassigned"}</td>
                      <td>
                        <span className={`badge ${
                          t.status === "Approved" ? "badge-green" :
                          t.status === "Rejected" ? "badge-red" :
                          t.status === "In Review" ? "badge-purple" : "badge-amber"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--green)" }}>
                          ₹{t.headPay || "0"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supervised Editors List */}
        <div className="section-card animate-fade" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <div className="section-title">My Supervised Editors</div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Editors registered using your invitation links</p>
          </div>
          <div style={{ padding: "8px 0" }}>
            {editors.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px 20px" }}>
                <div className="empty-icon">👥</div>
                <div className="empty-title">No editors yet</div>
                <div className="empty-desc">Generate an invitation link in Team Management to invite editors.</div>
              </div>
            ) : (
              editors.map(m => {
                const editorTasksCount = tasks.filter(t => t.editorUid === m.uid).length;
                const editorApprovedTasks = tasks.filter(t => t.editorUid === m.uid && t.status === "Approved");
                const editorEarned = editorApprovedTasks.reduce((sum, t) => sum + (Number(t.editorPay) || 0), 0);
                
                return (
                  <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: 14, flexShrink: 0 }}>
                      {(m.name || m.email)?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{m.name || m.email}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {editorTasksCount} tasks · Earned: ₹{editorEarned.toLocaleString()}
                      </div>
                    </div>
                    <span className="badge badge-green">Active</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
