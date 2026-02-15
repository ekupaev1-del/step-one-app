"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type UserStatus = "loading" | "exists" | "not_exists" | "error";

export default function PageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<UserStatus>("loading");
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      try {
        // Get Telegram WebApp initData
        const tg = (window as any).Telegram?.WebApp;
        if (!tg) {
          console.warn("[page-client] Telegram WebApp not available");
          setStatus("error");
          return;
        }

        const initData = tg.initData;
        if (!initData) {
          console.warn("[page-client] initData not available");
          setStatus("error");
          return;
        }

        // Call /api/me with initData
        const response = await fetch("/api/me", {
          method: "GET",
          headers: {
            "x-telegram-init-data": initData,
          },
        });

        const data = await response.json();

        if (data.exists && data.user) {
          // User exists -> redirect to profile (cabinet)
          setUserId(data.user.id);
          const debug = searchParams.get("debug");
          const debugKey = searchParams.get("debugKey");
          const params = new URLSearchParams();
          if (debug) params.set("debug", debug);
          if (debugKey) params.set("debugKey", debugKey);
          const queryString = params.toString();
          router.push(`/profile?id=${data.user.id}${queryString ? `&${queryString}` : ""}`);
          setStatus("exists");
        } else {
          // User doesn't exist -> redirect to registration (onboarding)
          // Note: User should be created by bot on /start, but if they open Mini App directly,
          // we'll redirect to registration which will handle the flow
          setStatus("not_exists");
          // Extract telegram_user_id from initData for registration
          try {
            const urlParams = new URLSearchParams(initData);
            const userParam = urlParams.get("user");
            if (userParam) {
              const user = JSON.parse(userParam);
              const telegramUserId = user?.id;
              if (telegramUserId) {
                // Redirect to registration
                // The registration page will need to handle user creation if needed
                // For now, redirect without id - user should go through /start in bot first
                router.push("/registration");
              } else {
                router.push("/registration");
              }
            } else {
              router.push("/registration");
            }
          } catch (e) {
            console.error("[page-client] Error parsing initData:", e);
            router.push("/registration");
          }
        }
      } catch (error) {
        console.error("[page-client] Error checking user:", error);
        setStatus("error");
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

  // Show error state with retry button
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
        <p style={{ marginBottom: "20px", color: "#666" }}>
          Ошибка загрузки. Откройте приложение через Telegram бота.
        </p>
        <button
          onClick={() => {
            setStatus("loading");
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
