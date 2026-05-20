"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { initFirebase } from "@/lib/firebase";
import { useEffect, useState } from "react";
import NotificationBell from "./NotificationBell";
import { collection, query, where, onSnapshot } from "firebase/firestore";

// ── Inline SVG Icons (no external deps) ──────────────────────────────────────
const IC = {
  grid:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  tasks:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 12 2 2 4-4"/></svg>,
  team:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  dollar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  gear:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  bell:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  chart:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M3 3v18h18"/><polyline points="18 9 12 15 8 11 3 16"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  chat:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:"100%",height:"100%"}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
};

type NavItem = { label: string; short: string; href: string; icon: React.ReactNode };

// ── Sidebar groups (desktop) ──────────────────────────────────────────────────
const SIDEBAR: Record<string, { section?: string; items: NavItem[] }[]> = {
  admin: [
    { items: [
      { label:"Dashboard", short:"Home",    href:"/admin",          icon:IC.grid },
      { label:"Tasks",     short:"Tasks",   href:"/admin/tasks",    icon:IC.tasks },
      { label:"Messages",  short:"Chat",    href:"/admin/messages", icon:IC.chat },
    ]},
    { section:"Management", items: [
      { label:"Team",      short:"Team",    href:"/admin/team",     icon:IC.team },
      { label:"Channels",  short:"Ch.",     href:"/admin/channels", icon:IC.bell },
      { label:"Finance",   short:"Finance", href:"/admin/finance",  icon:IC.dollar },
    ]},
    { section:"System", items: [
      { label:"Activity Logs", short:"Logs", href:"/admin/activity", icon:IC.chart },
      { label:"Settings",  short:"Settings",href:"/admin/settings", icon:IC.gear },
      { label:"My Profile",  short:"Profile", href:"/profile",        icon:IC.team },
    ]},
  ],
  head_editor: [
    { items: [
      { label:"Dashboard", short:"Home",    href:"/head-editor",             icon:IC.grid },
      { label:"My Tasks",  short:"Tasks",   href:"/head-editor/tasks",       icon:IC.tasks },
      { label:"Messages",  short:"Chat",    href:"/messages",                icon:IC.chat },
      { label:"My Team",   short:"Team",    href:"/head-editor/team",        icon:IC.team },
      { label:"Commission",short:"Earn",    href:"/head-editor/commission",  icon:IC.chart },
    ]},
    { section:"Account", items: [
      { label:"My Profile",  short:"Profile", href:"/profile",        icon:IC.team },
    ]}
  ],
  editor: [
    { items: [
      { label:"Dashboard", short:"Home",    href:"/editor",          icon:IC.grid },
      { label:"My Tasks",  short:"Tasks",   href:"/editor/tasks",    icon:IC.tasks },
      { label:"Messages",  short:"Chat",    href:"/messages",        icon:IC.chat },
      { label:"Earnings",  short:"Earn",    href:"/editor/earnings", icon:IC.dollar },
    ]},
    { section:"Account", items: [
      { label:"My Profile",  short:"Profile", href:"/profile",        icon:IC.team },
    ]}
  ],
};

// ── Mobile bottom nav (max 4 page links + bell = 5) ──────────────────────────
const MOBILE: Record<string, NavItem[]> = {
  admin: [
    { label:"Home",    short:"Home",    href:"/admin",          icon:IC.grid },
    { label:"Tasks",   short:"Tasks",   href:"/admin/tasks",    icon:IC.tasks },
    { label:"Team",    short:"Team",    href:"/admin/team",     icon:IC.team },
    { label:"Chat",    short:"Chat",    href:"/admin/messages", icon:IC.chat },
  ],
  head_editor: [
    { label:"Home",    short:"Home",    href:"/head-editor",             icon:IC.grid },
    { label:"Tasks",   short:"Tasks",   href:"/head-editor/tasks",       icon:IC.tasks },
    { label:"Team",    short:"Team",    href:"/head-editor/team",        icon:IC.team },
    { label:"Chat",    short:"Chat",    href:"/messages",                icon:IC.chat },
  ],
  editor: [
    { label:"Home",    short:"Home",    href:"/editor",          icon:IC.grid },
    { label:"Tasks",   short:"Tasks",   href:"/editor/tasks",    icon:IC.tasks },
    { label:"Earn",    short:"Earn",    href:"/editor/earnings", icon:IC.dollar },
    { label:"Chat",    short:"Chat",    href:"/messages",        icon:IC.chat },
  ],
};

const ROLE_LABEL: Record<string,string> = { admin:"Admin", head_editor:"Head Editor", editor:"Editor" };

// ── Component ─────────────────────────────────────────────────────────────────
export default function Sidebar({ role="admin", userName="", uid="" }:
  { role?:string; userName?:string; uid?:string }) {

  const pathname = usePathname();
  const router   = useRouter();
  const groups      = SIDEBAR[role] || SIDEBAR.admin;
  const mobileItems = MOBILE[role]  || MOBILE.admin;

  const [showPushBanner, setShowPushBanner] = useState(false);
  const [unread, setUnread] = useState(0);

  // Unread count for mobile bell badge
  useEffect(() => {
    if (!uid) return;
    let unsub: (() => void) | undefined;
    initFirebase().then(({ db }) => {
      const q = query(
        collection(db, "users", uid, "notifications"),
        where("read", "==", false)
      );
      unsub = onSnapshot(q, snap => setUnread(snap.size));
    });
    return () => unsub?.();
  }, [uid]);

  // Push permission prompt & auto-registration
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    
    // Auto-register token if already granted (fixes missing tokens on mobile)
    if (Notification.permission === "granted") {
      // Small delay to ensure Service Worker is ready
      setTimeout(() => {
        handleEnablePush(true);
      }, 2000);
    } else if (Notification.permission === "default") {
      const t = setTimeout(() => setShowPushBanner(true), 3000);
      return () => clearTimeout(t);
    }
  }, [uid]);

  const handleEnablePush = async (silent = false) => {
    if (!silent) setShowPushBanner(false);
    
    let perm = Notification.permission;
    if (perm !== "granted") {
      perm = await Notification.requestPermission();
    }
    
    if (perm !== "granted") return;
    try {
      const { getFCMToken } = await import("@/lib/firebase");
      const token = await getFCMToken();
      if (token && uid) {
        const { db } = await initFirebase();
        if (db) {
          const { doc, updateDoc, arrayUnion } = await import("firebase/firestore");
          // Store token in an array so a user can have multiple devices active at once
          await updateDoc(doc(db, "users", uid), { 
            fcmTokens: arrayUnion(token),
            fcmToken: token // Keep legacy field for backwards compatibility temporarily
          });
        }
      }
    } catch (e) { 
      console.error("FCM token error:", e); 
    }
  };

  const handleLogout = async () => {
    try { const { auth } = await initFirebase(); await signOut(auth); } catch {}
    router.push("/login");
  };

  // Exact match for role root pages, prefix for children
  const isActive = (href: string) => {
    const roots = ["/admin", "/editor", "/head-editor"];
    return roots.includes(href) ? pathname === href : pathname.startsWith(href);
  };

  return (
    <>
      {/* ── Push Permission Banner ─────────────────────────────────────── */}
      {showPushBanner && (
        <div className="push-banner">
          <span style={{fontSize:22,flexShrink:0}}>🔔</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,color:"var(--text)"}}>Enable Notifications</div>
            <div style={{fontSize:11.5,color:"var(--text-muted)",marginTop:2}}>Get instant task &amp; payment alerts</div>
          </div>
          <button onClick={()=>setShowPushBanner(false)} className="btn btn-ghost btn-sm" style={{flexShrink:0}}>Later</button>
          <button onClick={() => handleEnablePush(false)} className="btn btn-primary btn-sm" style={{flexShrink:0}}>Enable</button>
        </div>
      )}

      {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <Image src="/logo.png" alt="SkillBridge" width={36} height={36} className="logo-img" priority />
          <div className="logo-text">
            <h2>SkillBridge</h2>
            <p>{ROLE_LABEL[role] || role} Portal</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.section && <div className="nav-section-label">{group.section}</div>}
              {group.items.map(item => (
                <Link key={item.href} href={item.href}
                  className={`nav-item${isActive(item.href) ? " active" : ""}`}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {uid && <div style={{padding:"0 2px 8px"}}><NotificationBell uid={uid}/></div>}
          <Link href="/profile" className="user-chip" title="My Profile" style={{ textDecoration: "none" }}>
            <div className="user-avatar">{userName?.[0]?.toUpperCase()||"U"}</div>
            <div className="user-info">
              <div className="user-name">{userName}</div>
              <div className="user-role">{ROLE_LABEL[role]||role}</div>
            </div>
            <span className="nav-icon" style={{opacity:0.4,flexShrink:0}}>{IC.gear}</span>
          </Link>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ──────────────────────────────────────────── */}
      {/* Clean Link-only nav — NO component nesting, NO popups           */}
      <nav className="bottom-nav" aria-label="Navigation">
        <div className="bottom-nav-inner">
          {mobileItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`bottom-nav-item${isActive(item.href) ? " active" : ""}`}>
              <span className="bn-icon">{item.icon}</span>
              <span className="bn-label">{item.short}</span>
            </Link>
          ))}

          {/* Bell — always the last slot, links to /notifications page */}
          <Link href="/notifications"
            className={`bottom-nav-item${pathname === "/notifications" ? " active" : ""}`}>
            <span className="bn-icon" style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
              {IC.bell}
              {unread > 0 && (
                <span style={{
                  position:"absolute", top:-5, right:-5,
                  background:"#ef4444", color:"#fff",
                  borderRadius:99, fontSize:9, fontWeight:800,
                  minWidth:15, height:15,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  padding:"0 3px", border:"2px solid var(--bg)",
                  lineHeight:1,
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span className="bn-label">Alerts</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
