import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack (not Turbopack) — wagmi/viem require specific webpack externals
  turbopack: undefined,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
