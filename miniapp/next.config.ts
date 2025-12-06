import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для работы в Telegram WebApp
  experimental: {
    typedRoutes: true,
  },
  // Если нужно настроить базовый путь
  // basePath: '',
  // Если нужно настроить домен
  // assetPrefix: '',
};

export default nextConfig;
