"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUserSession } from "./providers/UserSessionProvider";
import { withUserId } from "@/lib/user/withUserId";

export default function PageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, isLoading, error, userExists } = useUserSession();

  useEffect(() => {
    if (isLoading) return;

    // If error, don't redirect - let error UI show
    if (error) return;

    // If user exists, redirect to profile
    if (userId && userExists) {
      const debug = searchParams.get("debug");
      const debugKey = searchParams.get("debugKey");
      const params = new URLSearchParams();
      if (debug) params.set("debug", debug);
      if (debugKey) params.set("debugKey", debugKey);
      const queryString = params.toString();
      const profileUrl = withUserId("/profile", userId ? String(userId) : null);
      const finalUrl = queryString ? `${profileUrl}${profileUrl.includes("?") ? "&" : "?"}${queryString}` : profileUrl;
      router.push(finalUrl as any);
      return;
    }

    // If user doesn't exist, redirect to registration (onboarding)
    if (userId && !userExists) {
      router.push(withUserId("/registration", userId ? String(userId) : null) as any);
      return;
    }

    // If no userId resolved, error will be shown
  }, [isLoading, error, userId, userExists, router, searchParams]);

  // Show loading state
  if (isLoading) {
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
  if (error) {
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
          {error}
        </p>
        <button
          onClick={() => {
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
      <p>Перенаправление...</p>
    </div>
  );
}
