import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillBridge CRM",
  description: "Internal Video Editing Management Platform — SkillBridge Ladder",
  applicationName: "SkillBridge CRM",
  authors: [{ name: "SkillBridge Ladder" }],
  keywords: ["CRM", "video editing", "SkillBridge", "task management"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SkillBridge CRM",
  },
  other: {
    // Prevent phone-number auto-detection (breaks layout)
    "format-detection": "telephone=no",
    // Disable iOS data-detector links
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

import StartupLoader from "@/components/StartupLoader";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* ── Strict viewport: no user zoom, device-width only ── */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        {/* ── iOS PWA splash + icon ── */}
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/logo.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#09090b" />

        {/* ── Prevent opening in browser when added to home screen ── */}
        <meta name="mobile-web-app-capable" content="yes" />

        {/* ── Preconnect for speed ── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <StartupLoader />
        {children}
      </body>
    </html>
  );
}
