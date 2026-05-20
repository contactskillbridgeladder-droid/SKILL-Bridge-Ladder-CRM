"use client";
import { useEffect, useState, useRef } from "react";

export default function PWAUpdater() {
  const [show, setShow] = useState(false);
  const [updating, setUpdating] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    // When the new SW takes control, reload immediately
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });

    navigator.serviceWorker.ready.then((reg) => {
      regRef.current = reg;

      // Show banner if a new SW is already waiting
      if (reg.waiting) setShow(true);

      // Watch for new SW installing
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            regRef.current = reg;
            setShow(true);
          }
        });
      });

      // Check for update immediately, then every 30s
      reg.update().catch(() => {});
      const id = setInterval(() => reg.update().catch(() => {}), 30_000);
      return () => clearInterval(id);
    });
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const reg = regRef.current;

      // 1. Tell any waiting SW to activate now
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        await new Promise((r) => setTimeout(r, 400));
      }

      // 2. Clear all SW caches so the reload fetches fresh assets
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }

      // 3. Hard reload — applies update even if SW lifecycle stalled
      window.location.reload();
    } catch {
      window.location.reload();
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
        .pwa-b { display:flex; gap:8px; font-size:12px; color:#a1a1aa; margin-top:6px; line-height:1.4; }
      `}} />

      <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
        <div style={{ width:38, height:38, borderRadius:10,
          background:"linear-gradient(135deg,#7c3aed,#2563eb)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:18, boxShadow:"0 4px 12px rgba(124,58,237,0.3)" }}>⚡</div>
        <div>
          <h4 style={{ margin:0, fontSize:14, fontWeight:800, color:"#f4f4f5" }}>
            New Update Ready
          </h4>
          <span style={{ fontSize:11, fontWeight:600, color:"#8b5cf6",
            background:"rgba(139,92,246,0.1)", padding:"2px 6px",
            borderRadius:4, display:"inline-block", marginTop:2 }}>
            v1.4.0
          </span>
        </div>
      </div>

      <div style={{ margin:"10px 0 16px", borderTop:"1px solid rgba(255,255,255,0.08)", paddingTop:10 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:600, color:"#e4e4e7" }}>What&apos;s new:</p>
        <div className="pwa-b"><span>🔒</span><span>Firestore rules hardened — no more snapshot errors</span></div>
        <div className="pwa-b"><span>⚡</span><span>Fixed all firebase import errors across layouts</span></div>
        <div className="pwa-b"><span>🔄</span><span>Session history tracking (non-blocking)</span></div>
        <div className="pwa-b"><span>💬</span><span>AI Video Copilot chat assistant</span></div>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
        <button onClick={() => setShow(false)}
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
