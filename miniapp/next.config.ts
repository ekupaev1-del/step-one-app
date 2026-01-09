import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для работы в Telegram WebApp
  typedRoutes: true,
  // Enable source maps in production for debugging React errors
  productionBrowserSourceMaps: true,
  // Экспортируем переменные окружения Vercel в клиент
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '',
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || 'development',
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL || '',
  },
  // Если нужно настроить базовый путь
  // basePath: '',
  // Если нужно настроить домен
  // assetPrefix: '',
};

export default nextConfig;
