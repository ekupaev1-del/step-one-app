"use client";

import { useEffect, useState } from "react";
import { safeStringify } from "./lib/safeStringify";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Log error for debugging
    console.error("[App Error]", error);
    
    // Dispatch to DebugOverlay if available
    if (typeof window !== "undefined") {
      try {
        const errorData = {
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          route: window.location.pathname + window.location.search,
          timestamp: new Date().toISOString(),
          suspectedCause: error.message?.includes("310") ? "hooks-order-changed" : "unknown",
        };
        window.dispatchEvent(new CustomEvent("errorboundary-caught", { detail: errorData }));
      } catch (e) {
        // Ignore
      }
    }
  }, [error]);

  const getErrorReport = () => {
    if (typeof window === "undefined") return {};
    
    const tg = (window as any).Telegram?.WebApp;
    
    return {
      error: {
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        name: error.name,
      },
      route: window.location.pathname + window.location.search,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
      telegram: tg ? {
        available: true,
        version: tg.version,
        platform: tg.platform,
        initDataLength: tg.initData?.length || 0,
      } : {
        available: false,
      },
    };
  };

  const copyErrorReport = async () => {
    try {
      const report = getErrorReport();
      const json = safeStringify(report, 2);
      
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else if (typeof document !== "undefined") {
        const textArea = document.createElement("textarea");
        textArea.value = json;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error("Failed to copy error report:", e);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-soft p-6">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Something went wrong
        </h1>

        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-semibold mb-2">Error Message:</p>
          <p className="text-sm text-red-800 break-words">
            {error.message || "An unexpected error occurred"}
          </p>
        </div>

        {showDebug && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold">Stack:</span>
              <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                {error.stack || "No stack trace available"}
              </pre>
            </div>
            <div className="mt-3">
              <span className="font-semibold">URL:</span> {typeof window !== "undefined" ? window.location.href : "N/A"}
            </div>
            <div className="mt-1">
              <span className="font-semibold">User Agent:</span> {typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Timestamp:</span> {new Date().toISOString()}
            </div>
            {typeof window !== "undefined" && (window as any).Telegram?.WebApp && (
              <div className="mt-1">
                <span className="font-semibold">Telegram:</span>{" "}
                Version: {(window as any).Telegram.WebApp.version || "N/A"},{" "}
                Platform: {(window as any).Telegram.WebApp.platform || "N/A"},{" "}
                InitData length: {(window as any).Telegram.WebApp.initData?.length || 0}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 mb-4">
          <button
            onClick={reset}
            className="w-full px-4 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full px-4 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            {showDebug ? "Hide" : "Show"} Debug Info
          </button>
          <button
            onClick={copyErrorReport}
            className="w-full px-4 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy Error Report (JSON)"}
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/";
              }
            }}
            className="w-full px-4 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Go to home
          </button>
        </div>
      </div>
    </div>
  );
}
