"use client";
import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { initFirebase } from "@/lib/firebase";

type Notif = { id: string; title: string; message: string; read: boolean; ctaLink: string; createdAt: any; type: string; };

export default function NotificationBell({ uid }: { uid: string }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [dbRef, setDbRef] = useState<any>(null);

  useEffect(() => {
    if (!uid) return;
    initFirebase().then(({ db }) => {
      setDbRef(db);
      const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(20));
      const unsub = onSnapshot(q, snap => {
        setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notif)));
      });
      return unsub;
    });
  }, [uid]);

  const unread = notifs.filter(n => !n.read).length;

  const markRead = async (notif: Notif) => {
    if (!notif.read && dbRef) {
      await updateDoc(doc(dbRef, "users", uid, "notifications", notif.id), { read: true });
    }
    if (notif.ctaLink) window.open(notif.ctaLink, "_self");
  };

  const markAllRead = async () => {
    if (!dbRef) return;
    const unreadOnes = notifs.filter(n => !n.read);
    await Promise.all(unreadOnes.map(n => updateDoc(doc(dbRef, "users", uid, "notifications", n.id), { read: true })));
  };

  const typeIcon: Record<string,string> = {
    task_assigned: "📋", review_feedback: "💬", payment_released: "💰", general: "🔔",
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ position: "relative", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s" }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "white", borderRadius: 99, fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid var(--bg-card)" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: 44, right: 0, width: 360, background: "var(--bg-card)", border: "1px solid var(--border-bright)", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", zIndex: 50, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Notifications {unread > 0 && <span style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", borderRadius: 99, padding: "1px 8px", fontSize: 12, marginLeft: 6 }}>{unread} new</span>}</div>
              {unread > 0 && <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent-light)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark all read</button>}
            </div>

            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {notifs.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                  No notifications yet
                </div>
              ) : notifs.map(n => (
                <div key={n.id} onClick={() => markRead(n)}
                  style={{ padding: "14px 20px", display: "flex", gap: 12, cursor: "pointer", background: n.read ? "transparent" : "rgba(124,58,237,0.04)", borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                >
                  <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{typeIcon[n.type] || "🔔"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 13.5, color: n.read ? "var(--text-dim)" : "var(--text)" }}>{n.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.4 }}>{n.message}</div>
                  </div>
                  {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#7c3aed", flexShrink: 0, marginTop: 6 }} />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
