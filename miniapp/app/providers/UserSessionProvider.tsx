"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getEffectiveUserId, clearUserIdCache } from "@/lib/user/getEffectiveUserId";
import { getTelegramUserIdSync } from "@/lib/telegram/getTelegramUserId";

interface UserSessionContextValue {
  userId: number | null;
  isLoading: boolean;
  error: string | null;
  userExists: boolean;
  telegramUserId: number | null;
  queryUserId: string | null;
}

const UserSessionContext = createContext<UserSessionContextValue | undefined>(undefined);

interface UserSessionProviderProps {
  children: ReactNode;
}

/**
 * UserSessionProvider - Single source of truth for user identity
 * Resolves user ID once on app start and shares across all pages
 */
export function UserSessionProvider({ children }: UserSessionProviderProps) {
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id");

  const [userId, setUserId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [queryUserId, setQueryUserId] = useState<string | null>(null);

  // Log diagnostics once per app boot
  const [hasLogged, setHasLogged] = useState(false);

  useEffect(() => {
    let mounted = true;

    const resolveUser = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Get Telegram user ID (sync check for logging)
        const tgId = getTelegramUserIdSync();
        setTelegramUserId(tgId);
        setQueryUserId(queryId);

        // Get effective user ID
        const { userId: effectiveUserId, source } = await getEffectiveUserId(queryId);

        if (!mounted) return;

        let resolvedUserExists = false;

        if (effectiveUserId) {
          // Verify user exists in DB by checking if user with this ID exists
          try {
            const response = await fetch(`/api/user?userId=${effectiveUserId}`);
            const data = await response.json();

            if (response.ok && data.ok) {
              resolvedUserExists = true;
              setUserId(effectiveUserId);
              setUserExists(true);
            } else {
              // User ID resolved but not found in DB
              setUserId(effectiveUserId); // Still set it, let pages handle the "not found" case
              setUserExists(false);
            }
          } catch (err: any) {
            console.error("[UserSessionProvider] Error verifying user:", err);
            // Still set the resolved ID, let pages handle errors
            setUserId(effectiveUserId);
            setUserExists(false);
          }
        } else {
          // No user ID resolved
          const hasTelegramWebApp = typeof window !== "undefined" && !!(window as any).Telegram;
          if (!hasTelegramWebApp && !queryId) {
            setError("Open the app via Telegram bot");
          } else {
            setError("Could not resolve user ID");
          }
          setUserId(null);
          setUserExists(false);
        }

        // Log diagnostics once (after userExists is determined)
        if (!hasLogged && process.env.NODE_ENV === "development") {
          console.log("[UserSessionProvider] Diagnostics:", {
            hasTelegramWebApp: typeof window !== "undefined" && !!(window as any).Telegram,
            telegramUserId: tgId,
            queryUserId: queryId,
            resolvedUserId: effectiveUserId,
            source,
            userExists: resolvedUserExists,
          });
          setHasLogged(true);
        }
      } catch (err: any) {
        if (!mounted) return;
        console.error("[UserSessionProvider] Error resolving user:", err);
        setError(err.message || "Error resolving user identity");
        setUserId(null);
        setUserExists(false);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    resolveUser();

    return () => {
      mounted = false;
    };
  }, [queryId, hasLogged]);

  const value: UserSessionContextValue = {
    userId,
    isLoading,
    error,
    userExists,
    telegramUserId,
    queryUserId,
  };

  return <UserSessionContext.Provider value={value}>{children}</UserSessionContext.Provider>;
}

/**
 * Hook to use user session context
 */
export function useUserSession(): UserSessionContextValue {
  const context = useContext(UserSessionContext);
  if (context === undefined) {
    throw new Error("useUserSession must be used within UserSessionProvider");
  }
  return context;
}
