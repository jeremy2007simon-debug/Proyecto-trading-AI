import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deploy-only branch (deploy/novacore-only): the legacy root page ("/")
  // was intentionally excluded from this deployment (see the branch's
  // commit message) — send visitors straight to the NovaCore dashboard.
  async redirects() {
    return [{ source: "/", destination: "/novacore", permanent: false }];
  },
};

export default nextConfig;
