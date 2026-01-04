import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Nunito } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import BuildStamp from "./components/BuildStamp";

const nunito = Nunito({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-primary"
});

export const metadata: Metadata = {
  title: "Мой путь к балансу",
  description: "Нежное приложение, которое помогает рассчитать калорийность и макроэлементы на каждый день.",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { rel: "apple-touch-icon", url: "/icons/icon-192.png" }
  ]
};

export const viewport: Viewport = {
  themeColor: "#F7F5F2"
};


export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className={`${nunito.className} ${nunito.variable} bg-background text-textPrimary antialiased`}>
        {children}
        {/* Build stamp for deployment verification - visible in devtools */}
        <BuildStamp />
        {/* Telegram WebApp Script */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <Script id="init-telegram-webapp" strategy="beforeInteractive">
          {`
            (function() {
              function initTelegramWebApp() {
                if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
                  const webApp = window.Telegram.WebApp;
                  if (typeof webApp.ready === 'function') {
                    webApp.ready();
                  }
                  if (typeof webApp.expand === 'function') {
                    webApp.expand();
                  }
                } else {
                  setTimeout(initTelegramWebApp, 50);
                }
              }
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initTelegramWebApp);
              } else {
                initTelegramWebApp();
              }
            })();
          `}
        </Script>
        <Script id="register-service-worker" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {
                  console.warn('Не удалось зарегистрировать service worker.');
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
