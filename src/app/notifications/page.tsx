"use client";
import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, limit } from "firebase/firestore";
import { initFirebase } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type Notif = {
  id: string; type: string; title: string;
  message: string; ctaLink: string; read: boolean; createdAt: any;
};

const TYPE_META: Record<string, { emoji: string; color: string; bg: string }> = {
  task_assigned:    { emoji:"📋", color:"#a78bfa", bg:"rgba(124,58,237,0.10)" },
  payment_released: { emoji:"💰", color:"#34d399", bg:"rgba(16,185,129,0.10)" },
  review_feedback:  { emoji:"💬", color:"#60a5fa", bg:"rgba(59,130,246,0.10)" },
  task_approved:    { emoji:"✅", color:"#34d399", bg:"rgba(16,185,129,0.10)" },
  task_rejected:    { emoji:"❌", color:"#f87171", bg:"rgba(239,68,68,0.10)"  },
  new_video:        { emoji:"🎬", color:"#60a5fa", bg:"rgba(59,130,246,0.10)" },
  general:          { emoji:"🔔", color:"#a78bfa", bg:"rgba(124,58,237,0.10)" },
};

function timeAgo(ts: any): string {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [db, setDb] = useState<any>(null);
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const router = useRouter();

  useEffect(() => {
    initFirebase().then(({ db: fireDb, auth }) => {
      const user = auth.currentUser;
      if (!user) { router.push("/login"); return; }
      setDb(fireDb);
      setUid(user.uid);

      const q = query(
        collection(fireDb, "users", user.uid, "notifications"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const unsub = onSnapshot(q, snap => {
        setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notif)));
        setLoading(false);
      });
      return unsub;
    });
  }, [router]);

  const markRead = async (n: Notif) => {
    if (!n.read && db && uid) {
      await updateDoc(doc(db, "users", uid, "notifications", n.id), { read: true });
    }
    if (n.ctaLink) router.push(n.ctaLink.replace(/^https?:\/\/[^/]+/, ""));
  };

  const markAllRead = async () => {
    if (!db || !uid) return;
    const unreadOnes = notifs.filter(n => !n.read);
    await Promise.all(
      unreadOnes.map(n => updateDoc(doc(db, "users", uid, "notifications", n.id), { read: true }))
    );
  };

  const displayed = filter === "unread" ? notifs.filter(n => !n.read) : notifs;
  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="page-header animate-fade">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}` : "All caught up 🎉"}
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={markAllRead}>
              ✓ Mark all read
            </button>
          </div>
        )}
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:8 }}>
        {(["all", "unread"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}>
            {f === "all" ? `All (${notifs.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* ── Notification List ───────────────────────────────────────────── */}
      <div className="section-card animate-fade">
        {loading ? (
          <div className="empty-state">
            <div style={{ fontSize:32 }}>⏳</div>
            <div className="empty-title">Loading notifications…</div>
          </div>
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <div className="empty-title">{filter === "unread" ? "No unread notifications" : "No notifications yet"}</div>
            <div className="empty-desc">When tasks are assigned or payments are released, you'll see them here.</div>
          </div>
        ) : (
          <div>
            {displayed.map((n, i) => {
              const meta = TYPE_META[n.type] || TYPE_META.general;
              return (
                <div key={n.id} onClick={() => markRead(n)}
                  style={{
                    display:"flex", alignItems:"flex-start", gap:14,
                    padding:"16px 20px",
                    background: n.read ? "transparent" : "rgba(124,58,237,0.03)",
                    borderBottom: i < displayed.length - 1 ? "1px solid var(--border)" : "none",
                    cursor:"pointer", transition:"background 0.12s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background="var(--bg-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? "transparent" : "rgba(124,58,237,0.03)")}
                >
                  {/* Emoji icon */}
                  <div style={{
                    width:40, height:40, borderRadius:10, flexShrink:0,
                    background: meta.bg, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    fontSize:18, marginTop:2,
                  }}>
                    {meta.emoji}
                  </div>

                  {/* Content */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontWeight: n.read ? 400 : 700,
                      fontSize: 14,
                      color: n.read ? "var(--text-dim)" : "var(--text)",
                      marginBottom:3,
                    }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.5 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize:11.5, color:"var(--text-muted)", marginTop:6, opacity:0.7 }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>

                  {/* Unread dot + arrow */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, marginTop:6 }}>
                    {!n.read && (
                      <div style={{ width:7, height:7, borderRadius:"50%", background:"#7c3aed" }} />
                    )}
                    {n.ctaLink && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2">
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
