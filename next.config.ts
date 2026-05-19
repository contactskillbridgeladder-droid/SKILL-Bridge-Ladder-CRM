import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  sw: "sw.js",
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
  turbopack: {},
};

export default withPWA(nextConfig);
