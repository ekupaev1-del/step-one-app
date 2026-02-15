import { Suspense } from "react";
import PageClient from "./page-client";
import { isDebugBypassEnabled } from "./lib/debugBypass";

export const dynamic = "force-dynamic";

function LoadingFallback() {
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

export default async function Page({
  searchParams,
}: {
  searchParams?: { id?: string | string[]; debug?: string; debugKey?: string };
}) {
  // Check for debug bypass
  const urlParams = new URLSearchParams();
  if (searchParams?.debug) urlParams.set("debug", searchParams.debug);
  if (searchParams?.debugKey) urlParams.set("debugKey", searchParams.debugKey);

  const debugEnabled = isDebugBypassEnabled(urlParams);

  // If debug bypass is enabled, show debug info page
  if (debugEnabled) {
    const id = searchParams?.id;
    const idValue = Array.isArray(id) ? id[0] : id;
    if (typeof idValue === "string" && idValue.length > 0) {
      // For debug mode with id, use client component
      return (
        <Suspense fallback={<LoadingFallback />}>
          <PageClient />
        </Suspense>
      );
    }
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
        <h1>Step One - Debug Mode</h1>
        <p style={{ color: "green", marginTop: "10px" }}>✓ Debug bypass enabled</p>
        <p style={{ marginTop: "20px" }}>Add ?id=USER_ID to access the app</p>
        <p style={{ marginTop: "10px", fontSize: "14px", color: "#666" }}>
          Example: /?debug=1&debugKey=YOUR_KEY&id=123
        </p>
      </div>
    );
  }

  // Use client component to check user via /api/me
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PageClient />
    </Suspense>
  );
}
