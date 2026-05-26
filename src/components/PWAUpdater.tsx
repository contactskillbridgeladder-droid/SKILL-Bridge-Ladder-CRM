"use client";
import { useEffect, useState, useRef } from "react";

export default function PWAUpdater() {
  const [show, setShow] = useState(false);
  const [updating, setUpdating] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    // When the new SW takes control, reload immediately
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });

    navigator.serviceWorker.ready.then((reg) => {
      regRef.current = reg;

      // If a SW is already waiting, activate it silently on first load
      // (don't show a banner — the user just arrived, apply the update)
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }

      // Watch for new SW installing (this fires during the user's session)
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            regRef.current = reg;
            // Only show banner if not already dismissed this session
            if (!dismissed.current) setShow(true);
          }
        });
      });

      // Check for update once on load, then every 5 minutes (not 30s!)
      reg.update().catch(() => {});
      const id = setInterval(() => reg.update().catch(() => {}), 5 * 60_000);
      return () => clearInterval(id);
    });
  }, []);

  useEffect(() => {
    if (show && !updating) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 7000); // Auto dismiss after 7 seconds
      return () => clearTimeout(timer);
    }
  }, [show, updating]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const reg = regRef.current;

      // 1. Tell any waiting SW to activate now
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise((r) => setTimeout(r, 400));
      }

      // 2. We let Workbox handle the cache clearing automatically upon activation
      // to ensure the app remains fully available offline.

      // 3. Hard reload — applies update even if SW lifecycle stalled
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    dismissed.current = true;
    setShow(false);
    // Silently apply the update in background — next navigation will use it
    const reg = regRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      background: "rgba(15,15,20,0.97)", backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(124,58,237,0.4)", borderRadius: 16,
      padding: 20, width: 340, maxWidth: "calc(100vw - 48px)",
      zIndex: 99999, boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
      fontFamily: "var(--font-inter,'Inter',sans-serif)",
      animation: "pwa-slide-up 0.4s cubic-bezier(0.16,1,0.3,1)"
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pwa-slide-up {
          from { transform: translateY(30px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}} />

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
        <div style={{ width:38, height:38, borderRadius:10,
          background:"linear-gradient(135deg,#7c3aed,#2563eb)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:18, boxShadow:"0 4px 12px rgba(124,58,237,0.3)" }}>⚡</div>
        <div>
          <h4 style={{ margin:0, fontSize:14, fontWeight:800, color:"#f4f4f5" }}>
            New Update Available
          </h4>
          <span style={{ fontSize:12, color:"#a1a1aa", marginTop:2, display:"block" }}>
            Refresh to apply the latest changes
          </span>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop: 8 }}>
        <button onClick={handleDismiss}
          disabled={updating}
          style={{ background:"transparent", border:"none", color:"#a1a1aa",
            fontSize:12.5, fontWeight:600, cursor:"pointer",
            padding:"8px 14px", borderRadius:8, opacity: updating ? 0.4 : 1 }}>
          Later
        </button>
        <button onClick={handleUpdate}
          disabled={updating}
          style={{ background:"linear-gradient(135deg,#7c3aed,#2563eb)",
            border:"none", color:"#fff", fontSize:12.5, fontWeight:700,
            borderRadius:8, padding:"8px 16px", cursor: updating ? "wait" : "pointer",
            boxShadow:"0 4px 12px rgba(124,58,237,0.3)",
            opacity: updating ? 0.7 : 1, transition:"all 0.2s" }}>
          {updating ? "Updating…" : "Update Now 🚀"}
        </button>
      </div>
    </div>
  );
}
