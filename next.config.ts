import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@modelcontextprotocol/sdk", "@mariozechner/pi-ai"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default config;
