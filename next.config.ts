import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  sw: "sw.js",
  reloadOnOnline: false,
  workboxOptions: {
    // When false: new SW waits until PWAUpdater posts { type: 'SKIP_WAITING' }
    // The SW then auto-adds a message listener for SKIP_WAITING
    skipWaiting: false,
  },
});

const nextConfig: NextConfig = {
  // Keep firebase-admin + native gRPC binaries in Node.js runtime (not bundled by webpack)
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/firestore",
    "grpc",
    "@grpc/grpc-js",
    "@grpc/proto-loader",
    "google-auth-library",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "skillbridgeladder.in" },
      { protocol: "https", hostname: "crm.skillbridgeladder.in" },
    ],
  },

  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},
};

export default withPWA(nextConfig);
