import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libsql ships a native binding; keep it out of the bundler.
  serverExternalPackages: ["@libsql/client"],
  // Production container serves the traced standalone output.
  output: "standalone",
};

export default nextConfig;
