"use client";

import { useEffect, useState, useRef } from "react";

export default function PWAUpdater() {
  const [show, setShow] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;

    // When a new SW takes control, reload the page to apply the update
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Helper: show the banner if a waiting SW is detected
    function checkForWaiting(reg: ServiceWorkerRegistration) {
      regRef.current = reg;
      if (reg.waiting) {
        setShow(true);
      }
    }

    // Helper: watch a newly installing SW until it reaches "installed" state
    function trackInstalling(reg: ServiceWorkerRegistration) {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          // New version is waiting — show the banner
          regRef.current = reg;
          setShow(true);
        }
      });
    }

    navigator.serviceWorker.ready.then((reg) => {
      regRef.current = reg;

      // Check immediately if something is already waiting
      checkForWaiting(reg);

      // Watch for future updates
      reg.addEventListener("updatefound", () => {
        trackInstalling(reg);
      });

      // Poll for updates every 60 seconds while the tab is open
      const interval = setInterval(() => {
        reg.update().catch(() => {});
      }, 60_000);

      return () => clearInterval(interval);
    });
  }, []);

  const handleUpdate = () => {
    const reg = regRef.current;
    if (reg?.waiting) {
      // Tell the waiting SW to skip waiting and become active
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      // Fallback: hard reload
      window.location.reload();
    }
  };

  if (!show) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      background: "rgba(15, 15, 20, 0.95)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(124, 58, 237, 0.4)",
      borderRadius: 16,
      padding: 20,
      width: "340px",
      maxWidth: "calc(100vw - 48px)",
      zIndex: 99999,
      boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(124, 58, 237, 0.15)",
      fontFamily: "var(--font-inter, 'Inter', sans-serif)",
      animation: "pwa-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pwa-slide-up {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .pwa-bullet {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #a1a1aa;
          margin-top: 6px;
          line-height: 1.4;
        }
      `}} />

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "linear-gradient(135deg, #7c3aed, #2563eb)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)"
        }}>
          ⚡
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#f4f4f5", letterSpacing: "-0.01em" }}>
            New System Update Ready
          </h4>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#8b5cf6", background: "rgba(139, 92, 246, 0.1)", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginTop: 2 }}>
            Version 1.4.0
          </span>
        </div>
      </div>

      <div style={{ margin: "10px 0 16px 0", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 10 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#e4e4e7" }}>What&apos;s new:</p>

        <div className="pwa-bullet">
          <span>💬</span>
          <span><strong>AI Video Copilot Chat</strong> built into the Video AI analyzer page.</span>
        </div>
        <div className="pwa-bullet">
          <span>🔒</span>
          <span><strong>Secure Credentials</strong> — removed local JSON secrets, env var based.</span>
        </div>
        <div className="pwa-bullet">
          <span>🔄</span>
          <span><strong>Live Update Manager</strong> — this banner, delivering instant PWA updates.</span>
        </div>
        <div className="pwa-bullet">
          <span>🛡️</span>
          <span><strong>Firestore Rules Hardened</strong> — fixed snapshot permission errors.</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={() => setShow(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "#a1a1aa",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            padding: "8px 14px",
            borderRadius: 8,
            transition: "all 0.2s"
          }}
          onMouseOver={e => e.currentTarget.style.color = "#f4f4f5"}
          onMouseOut={e => e.currentTarget.style.color = "#a1a1aa"}
        >
          Later
        </button>
        <button
          onClick={handleUpdate}
          style={{
            background: "linear-gradient(135deg, #7c3aed, #2563eb)",
            border: "none",
            color: "#ffffff",
            fontSize: 12.5,
            fontWeight: 700,
            borderRadius: 8,
            padding: "8px 16px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
            transition: "all 0.2s"
          }}
          onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseOut={e => e.currentTarget.style.transform = "none"}
        >
          Update Now 🚀
        </button>
      </div>
    </div>
  );
}
