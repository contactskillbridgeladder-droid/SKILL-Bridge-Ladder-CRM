"use client";
import { useEffect, useState, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { initFirebase } from "@/lib/firebase";

type Notif = { id: string; title: string; message: string; read: boolean; ctaLink: string; createdAt: any; type: string; };

export default function NotificationBell({ uid }: { uid: string }) {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [dbRef, setDbRef] = useState<any>(null);
  const [activeToast, setActiveToast] = useState<Notif | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let isFirstLoad = true;
    initFirebase().then(({ db }) => {
      setDbRef(db);
      const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(20));
      const unsub = onSnapshot(q, snap => {
        const newNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notif));
        setNotifs(newNotifs);

        if (!isFirstLoad) {
          // Check for any newly added unread notification
          snap.docChanges().forEach(change => {
            if (change.type === "added") {
              const n = { id: change.doc.id, ...change.doc.data() } as Notif;
              if (!n.read) {
                // Play notification sound
                const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-500.wav");
                audio.volume = 0.4;
                audio.play().catch(() => {});

                // Try browser push desktop notification
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                  try {
                    new Notification(n.title, {
                      body: n.message,
                      icon: "/logo.png"
                    });
                  } catch (e) {
                    console.error("Failed to trigger desktop notification:", e);
                  }
                }

                // In-app visual toast
                setActiveToast(n);
                // Dismiss in-app toast after 6 seconds
                setTimeout(() => {
                  setActiveToast(prev => prev?.id === n.id ? null : prev);
                }, 6000);
              }
            }
          });
        }
        isFirstLoad = false;
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

  const typeIcon: Record<string, string> = {
    task_assigned: "📋", review_feedback: "💬", payment_released: "💰", general: "🔔",
    task_approved: "✅", task_rejected: "❌", new_video: "🎬"
  };

  const togglePanel = () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      // Position dropdown ABOVE the bell, anchored to its left edge (extending to the right)
      setDropPos({
        top: rect.top - 8, // 8px gap above the bell
        left: Math.max(16, rect.left), // left-aligned, stay in viewport
      });
    }
    setOpen(!open);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={bellRef}
        onClick={togglePanel}
        style={{ position: "relative", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s" }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "white", borderRadius: 99, fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid var(--bg-card)" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && dropPos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9990 }} />
          <div style={{
            position: "fixed",
            bottom: `calc(100vh - ${dropPos.top}px)`,
            left: `${dropPos.left}px`,
            width: 370,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "min(500px, 70vh)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-bright)",
            borderRadius: 14,
            boxShadow: "0 -12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
            zIndex: 9999,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "notif-pop-up 0.2s ease-out"
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Notifications {unread > 0 && <span style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", borderRadius: 99, padding: "1px 8px", fontSize: 12, marginLeft: 6 }}>{unread} new</span>}</div>
              {unread > 0 && <button onClick={markAllRead} style={{ background: "none", border: "none", color: "var(--accent-light)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark all read</button>}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
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

      {/* In-app glassmorphic Toast notification */}
      {activeToast && (
        <div
          onClick={() => {
            markRead(activeToast);
            setActiveToast(null);
          }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 320,
            background: "rgba(30, 30, 40, 0.75)",
            backdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid var(--border-bright)",
            borderRadius: 14,
            padding: "16px 20px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            zIndex: 99999,
            cursor: "pointer",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            color: "var(--text)"
          }}
        >
          <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>
            {typeIcon[activeToast.type] || "🔔"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{activeToast.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>{activeToast.message}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveToast(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
              marginLeft: 4
            }}
          >
            ✕
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes notif-pop-up {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
