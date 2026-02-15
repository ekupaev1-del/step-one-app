"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getTelegramUserId, initTelegramWebApp } from "@/lib/telegram";

type UserStatus = "loading" | "exists" | "not_exists" | "error";

export default function PageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<UserStatus>("loading");
  const [userId, setUserId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    initTelegramWebApp(); // Initialize Telegram WebApp once
    
    const checkUser = async () => {
      try {
        // Get Telegram user ID using helper
        const telegramId = getTelegramUserId();
        
        // Diagnostics
        const tgExists = typeof window !== "undefined" && !!(window as any).Telegram;
        const env = process.env.NODE_ENV || "unknown";
        
        if (!telegramId) {
          setStatus("error");
          setErrorMessage(
            `Не удалось получить ID пользователя Telegram.\n\n` +
            `Диагностика:\n` +
            `- Telegram WebApp: ${tgExists ? "✅" : "❌"}\n` +
            `- Окружение: ${env}\n\n` +
            `Откройте приложение через Telegram бота.`
          );
          return;
        }

        // Call API route to check if user exists
        const response = await fetch(`/api/user/profile?telegram_id=${telegramId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Ошибка проверки пользователя");
        }

        if (data.exists && data.user) {
          // User exists -> redirect to profile (cabinet)
          setUserId(data.user.id);
          const debug = searchParams.get("debug");
          const debugKey = searchParams.get("debugKey");
          const params = new URLSearchParams();
          if (debug) params.set("debug", debug);
          if (debugKey) params.set("debugKey", debugKey);
          const queryString = params.toString();
          const profileUrl = `/profile${queryString ? `?${queryString}` : ""}`;
          router.push(profileUrl as any);
          setStatus("exists");
        } else {
          // User doesn't exist -> redirect to registration (onboarding)
          setStatus("not_exists");
          router.push("/registration");
        }
      } catch (error: any) {
        console.error("[page-client] Error checking user:", error);
        setStatus("error");
        setErrorMessage(error?.message || "Ошибка проверки пользователя. Попробуйте обновить страницу.");
      }
    };

    checkUser();
  }, [router, searchParams]);

  // Show loading state
  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <h1>Step One</h1>
        <p>Загрузка...</p>
      </div>
    );
  }

  // Show error state with retry button and diagnostics
  if (status === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <h1>Step One</h1>
        <p style={{ marginBottom: "20px", color: "#666", whiteSpace: "pre-line" }}>
          {errorMessage || "Ошибка загрузки. Откройте приложение через Telegram бота."}
        </p>
        <button
          onClick={() => {
            setStatus("loading");
            setErrorMessage(null);
            window.location.reload();
          }}
          style={{
            padding: "12px 24px",
            backgroundColor: "#8FBC8F",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  // This should not be reached as we redirect, but just in case
  return null;
}
