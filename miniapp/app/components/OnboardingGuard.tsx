"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getOnboardingState, getRedirectPath, type OnboardingState } from "../../lib/onboardingState";

interface OnboardingGuardProps {
  userId: number | null;
  children: ReactNode;
  showDebug?: boolean;
}

/**
 * OnboardingGuard - Unified guard component for all pages
 * Checks consent and profile completion, redirects only when needed
 */
export default function OnboardingGuard({ userId, children, showDebug = false }: OnboardingGuardProps) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>({
    hasUser: false,
    hasConsent: false,
    profileComplete: false,
    userId: null,
    telegram_id: null,
    loading: true,
    error: null,
  });
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [redirectTriggered, setRedirectTriggered] = useState(false);

  useEffect(() => {
    if (!userId) {
      setState({
        hasUser: false,
        hasConsent: false,
        profileComplete: false,
        userId: null,
        telegram_id: null,
        loading: false,
        error: "userId is required",
      });
      return;
    }

    const checkOnboarding = async () => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      
      try {
        const onboardingState = await getOnboardingState(userId);
        setState(onboardingState);

        // Determine if redirect is needed
        const path = getRedirectPath(onboardingState);
        setRedirectPath(path);

        // Only redirect if path is determined AND we haven't redirected yet
        if (path && !redirectTriggered) {
          setRedirectTriggered(true);
          console.log(`[OnboardingGuard] Redirecting to: ${path}`, {
            hasUser: onboardingState.hasUser,
            hasConsent: onboardingState.hasConsent,
            profileComplete: onboardingState.profileComplete,
          });
          
          // Use router.push for client-side navigation (faster)
          router.push(path);
        }
      } catch (error: any) {
        console.error("[OnboardingGuard] Error checking onboarding:", error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error?.message || "Failed to check onboarding state",
        }));
      }
    };

    checkOnboarding();
  }, [userId, router, redirectTriggered]);

  // Show loading while checking
  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Загрузка...</div>
        {showDebug && (
          <div className="fixed bottom-4 right-4 bg-yellow-100 p-2 text-xs rounded border">
            <div>Loading onboarding state...</div>
            <div>userId: {userId}</div>
          </div>
        )}
      </div>
    );
  }

  // If redirect is in progress, show loading
  if (redirectPath && redirectTriggered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textSecondary">Перенаправление...</div>
        {showDebug && (
          <div className="fixed bottom-4 right-4 bg-yellow-100 p-2 text-xs rounded border">
            <div>Redirecting to: {redirectPath}</div>
            <div>hasUser: {state.hasUser ? "✅" : "❌"}</div>
            <div>hasConsent: {state.hasConsent ? "✅" : "❌"}</div>
            <div>profileComplete: {state.profileComplete ? "✅" : "❌"}</div>
          </div>
        )}
      </div>
    );
  }

  // If no redirect needed, show children
  // Also show children if there's an error (graceful degradation)
  return (
    <>
      {children}
      {showDebug && (
        <div className="fixed bottom-4 right-4 bg-blue-100 p-2 text-xs rounded border max-w-xs z-50">
          <div className="font-semibold mb-1">Onboarding Debug</div>
          <div>userId: {userId || "null"}</div>
          <div>hasUser: {state.hasUser ? "✅" : "❌"}</div>
          <div>hasConsent: {state.hasConsent ? "✅" : "❌"}</div>
          <div>profileComplete: {state.profileComplete ? "✅" : "❌"}</div>
          <div>redirectPath: {redirectPath || "none"}</div>
          {state.error && <div className="text-red-600">Error: {state.error}</div>}
        </div>
      )}
    </>
  );
}
