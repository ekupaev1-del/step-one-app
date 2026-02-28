"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { QuestionnaireFormContent } from "../questionnaire";
import { getTelegramUserId } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-textSecondary">Загрузка...</div>
    </div>
  );
}

// Клиентский компонент-обертка для получения searchParams
function RegistrationPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [checkingPrivacy, setCheckingPrivacy] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState<boolean | null>(null);

  // Быстро получаем userId из URL при монтировании
  useEffect(() => {
    setMounted(true);
    const userIdParam = searchParams.get("id");
    
    // Fallback через window.location для быстрой загрузки
    if (!userIdParam && typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const fallbackUserId = urlParams.get("id");
      setUserId(fallbackUserId);
    } else {
      setUserId(userIdParam);
    }
  }, [searchParams]);

  // Check if user already exists by telegram_id (cabinet gating)
  useEffect(() => {
    if (!mounted) {
      return;
    }

    const checkExistingUser = async () => {
      const telegramId = getTelegramUserId();
      
      if (!telegramId) {
        // No telegram ID - proceed with onboarding
        setPrivacyAccepted(true);
        setCheckingPrivacy(false);
        return;
      }

      // Check if user exists by telegram_id
      try {
        const response = await fetch(`/api/user/by-telegram-id?telegramId=${telegramId}`);
        const data = await response.json();

        if (data.ok && data.found && data.userId) {
          // User already exists - redirect to profile
          router.push(`/profile?id=${data.userId}`);
          return;
        }
      } catch (err: any) {
        console.error("[registration] Error checking user by telegram_id:", err);
        // On error, proceed with onboarding
      }

      // User doesn't exist or error - proceed with onboarding
      setPrivacyAccepted(true);
      setCheckingPrivacy(false);
    };

    checkExistingUser();
  }, [mounted, router]);

  // Показываем контент сразу, не ждем Suspense
  if (!mounted || checkingPrivacy) {
    return <LoadingFallback />;
  }

  // Если согласие не дано, редирект уже произошел
  if (privacyAccepted === false) {
    return <LoadingFallback />;
  }

  return <QuestionnaireFormContent initialUserId={userId} />;
}

// Главный компонент страницы
export default function RegistrationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RegistrationPageContent />
    </Suspense>
  );
}
