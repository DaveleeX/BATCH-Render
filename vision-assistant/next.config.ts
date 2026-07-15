import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 便于 Docker / 国内云函数 / 容器镜像部署
  output: "standalone",
};

export default nextConfig;
