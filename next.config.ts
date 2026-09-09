import type { NextConfig } from "next";

// Sandbox/CI com pouca memória pode limitar os workers de geração estática
// (ex.: CTUBE_BUILD_CPUS=2). Sem a variável, usa o padrão do Next (Vercel).
const buildCpus = process.env.CTUBE_BUILD_CPUS
  ? Number(process.env.CTUBE_BUILD_CPUS)
  : undefined;

const nextConfig: NextConfig = {
  ...(buildCpus ? { experimental: { cpus: buildCpus } } : {}),
  reactStrictMode: true,
  allowedDevOrigins: ["*.daytonaproxy01.net", "https://*.daytonaproxy01.net"],
  // jsdom/BotGuard are only used server-side (PO-token downloads); keep them
  // out of the Turbopack bundle and load them from node_modules at runtime.
  serverExternalPackages: ["jsdom", "bgutils-js"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "*.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
