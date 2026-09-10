import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is an optional native module (loaded lazily in src/lib/server/db.ts).
  // Keep it a runtime external so it is never bundled and, where it can't load,
  // the app degrades to in-memory behaviour instead of failing the build.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
