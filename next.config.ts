import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Treat node: built-ins as external so webpack doesn't try to bundle them
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        ({ request }: { request: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request.startsWith("node:")) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
