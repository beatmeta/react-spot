import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-spot", "@react-spot-example/ui"],
  // Next.js 16 默认 Turbopack；显式声明以避免与 webpack 配置冲突
  turbopack: {},
};

export default nextConfig;
