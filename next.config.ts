import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Accounts are created by connecting a wallet; old /signup links (query string kept) go to /login.
  async redirects() {
    return [{ source: "/signup", destination: "/login", permanent: false }];
  },
  experimental: {
    // Evidence uploads go through server actions; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
