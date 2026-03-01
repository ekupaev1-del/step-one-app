"use client";

import { useState } from "react";
import { getTelegramUserIdAsync } from "@/lib/telegram/getTelegramUserId";

interface TelegramIdErrorProps {
  onRetry: (telegramId: number | null) => void;
}

export function TelegramIdError({ onRetry }: TelegramIdErrorProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const telegramId = await getTelegramUserIdAsync();
      onRetry(telegramId);
    } catch (err) {
      console.error("[TelegramIdError] Retry failed:", err);
      onRetry(null);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
        <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
        <p className="text-textPrimary mb-4">
          Не удалось получить ID пользователя Telegram.
          <br />
          Откройте приложение через бота.
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="px-6 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {retrying ? "Повтор..." : "Повторить"}
        </button>
      </div>
    </div>
  );
}
