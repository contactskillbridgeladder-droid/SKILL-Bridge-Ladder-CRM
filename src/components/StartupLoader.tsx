"use client";

import { useEffect, useState } from "react";

export default function StartupLoader() {
  const [mounted, setMounted] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Show splash loader for 1800ms, then start fade-out transition
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1800);

    // Completely unmount after transition finishes (600ms transition time)
    const unmountTimer = setTimeout(() => {
      setMounted(false);
    }, 2400);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div className={`startup-loader-container ${fadeOut ? "fade-out" : ""}`}>
      <div className="loader-logo-wrapper">
        <div className="loader-glow-ring"></div>
        <div className="loader-glow-ring-inner"></div>
        <img src="/logo.png" alt="SkillBridge CRM" className="loader-logo" />
      </div>
      <h1 className="loader-brand gradient-text">SkillBridge CRM</h1>
      <p className="loader-status">Initializing Workspace...</p>
      <div className="loader-progress-track">
        <div className="loader-progress-bar"></div>
      </div>
    </div>
  );
}
