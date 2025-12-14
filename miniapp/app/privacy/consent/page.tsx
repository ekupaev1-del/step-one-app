"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import "../../globals.css";

function ConsentPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userIdParam = searchParams.get("id");
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userIdParam) {
      const n = Number(userIdParam);
      if (Number.isFinite(n) && n > 0) {
        setUserId(n);
      } else {
        setError("Некорректный id пользователя");
      }
    } else {
      setError("ID не передан");
    }
  }, [userIdParam]);

  const handleAccept = async () => {
    if (!userId) {
      setError("ID пользователя не найден");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/privacy/consent?id=${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Ошибка сохранения согласия");
      }

      // Перенаправляем на регистрацию/онбординг
      router.push(`/registration?id=${userId}`);
    } catch (err: any) {
      console.error("[handleAccept] Ошибка:", err);
      setError(err.message || "Не удалось сохранить согласие. Попробуйте позже.");
      setLoading(false);
    }
  };

  if (error && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
          <p className="text-textPrimary">{error}</p>
          <p className="text-sm text-textSecondary mt-4">Запустите приложение через Telegram бота</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F6F3EF' }}>
      <div className="max-w-md w-full bg-white rounded-[44px] shadow-lg p-8" style={{ paddingTop: '56px' }}>
        <p className="text-xs uppercase text-gray-400 mb-6 tracking-[0.15em] font-light text-center">
          ДОБРО ПОЖАЛОВАТЬ
        </p>
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800 leading-tight text-center">
          Политика конфиденциальности
        </h1>

        <div className="mb-8 text-gray-700 text-sm leading-relaxed">
          <p className="mb-4">
            Продолжая, вы соглашаетесь с{" "}
            <Link 
              href={`/privacy${userId ? `?id=${userId}` : ''}` as any}
              className="text-accent hover:underline font-medium"
            >
              Политикой конфиденциальности
            </Link>
            {" "}Step One.
          </p>
          <p className="text-xs text-gray-500">
            Мы обрабатываем ваши персональные данные (имя, телефон, email, данные о питании) для предоставления функционала сервиса. 
            Данные хранятся в Supabase и обрабатываются в соответствии с законодательством РФ.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={loading || !userId}
          className="w-full py-4 px-6 text-white font-medium rounded-[50px] shadow-md hover:opacity-90 transition-opacity text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: '#A4C49A' }}
        >
          {loading ? "Сохранение..." : "Согласен и продолжить"}
        </button>

        <div className="mt-6 text-center">
          <Link 
            href={`/privacy${userId ? `?id=${userId}` : ''}` as any}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Прочитать полный текст Политики конфиденциальности
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
      </div>
    }>
      <ConsentPageContent />
    </Suspense>
  );
}
