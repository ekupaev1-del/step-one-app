"use client";

import { useState, useEffect } from "react";
import { getTelegramUserIdAsync } from "../telegram/getTelegramUserId";

interface UseTelegramUserResult {
  telegramId: number | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Hook to reliably get Telegram user ID with retry logic
 * Caches result in memory to prevent re-fetching on tab switches
 */
let cachedTelegramId: number | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useTelegramUser(): UseTelegramUserResult {
  const [telegramId, setTelegramId] = useState<number | null>(cachedTelegramId);
  const [isLoading, setIsLoading] = useState(!cachedTelegramId);
  const [error, setError] = useState<string | null>(null);

  const fetchTelegramId = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check cache first
      if (cachedTelegramId && Date.now() - cacheTimestamp < CACHE_TTL) {
        setTelegramId(cachedTelegramId);
        setIsLoading(false);
        return;
      }

      const id = await getTelegramUserIdAsync();
      
      if (id) {
        cachedTelegramId = id;
        cacheTimestamp = Date.now();
        setTelegramId(id);
        setError(null);
      } else {
        // Check if Telegram WebApp exists
        const hasWebApp = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp;
        if (hasWebApp) {
          setError("Не удалось определить Telegram ID. Нажмите 'Попробовать снова'.");
        } else {
          setError("Откройте приложение через Telegram бота");
        }
        setTelegramId(null);
      }
    } catch (err: any) {
      console.error("[useTelegramUser] Error:", err);
      setError(err.message || "Ошибка получения Telegram ID");
      setTelegramId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelegramId();
  }, []);

  return {
    telegramId,
    isLoading,
    error,
    retry: fetchTelegramId,
  };
}
