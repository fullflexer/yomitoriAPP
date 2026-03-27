import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Next.js 16 の .env パーサーが RangeError を起こすため手動ロード
function loadEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex < 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found — ok
  }
}

loadEnvFile();

const nextConfig: NextConfig = {
  turbopack: {},
  serverExternalPackages: ["sharp", "pg"],
  middlewareClientMaxBodySize: "50mb",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
