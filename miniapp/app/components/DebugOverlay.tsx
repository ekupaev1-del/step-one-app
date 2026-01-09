"use client";

import { useState, useEffect } from "react";
import { safeStringify } from "../lib/safeStringify";

interface ErrorInfo {
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  timestamp: string;
  telegram?: {
    available: boolean;
    version?: string;
    platform?: string;
  };
  environment?: {
    vercelEnv?: string;
    nodeEnv?: string;
  };
  suspectedCause?: string;
}

export default function DebugOverlay() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "raw">("summary");
  const [copied, setCopied] = useState<string | null>(null);

  // Check if debug mode is enabled
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const urlParams = new URLSearchParams(window.location.search);
      const urlDebug = urlParams.get("debug") === "1";
      const envDebug = process.env.NEXT_PUBLIC_DEBUG_OVERLAY === "1";

      if (urlDebug || envDebug) {
        setIsEnabled(true);
      }
    } catch (e) {
      // If check fails, disable debug
      setIsEnabled(false);
    }
  }, []);

  // Capture ErrorBoundary errors
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return;

    const handleErrorBoundary = (event: CustomEvent) => {
      try {
        const errorData = event.detail;
        const errorInfo: ErrorInfo = {
          message: errorData.message || "ErrorBoundary caught error",
          stack: errorData.stack,
          componentStack: errorData.componentStack,
          route: errorData.route || window.location.pathname + window.location.search,
          timestamp: errorData.timestamp || new Date().toISOString(),
          telegram: {
            available: typeof (window as any).Telegram !== "undefined",
            version: (window as any).Telegram?.WebApp?.version,
            platform: (window as any).Telegram?.WebApp?.platform,
          },
          environment: {
            vercelEnv: process.env.VERCEL_ENV,
            nodeEnv: process.env.NODE_ENV,
          },
          suspectedCause: errorData.suspectedCause || "unknown",
        };

        setErrors((prev) => [...prev, errorInfo]);
      } catch (e) {
        console.error("[DebugOverlay] Failed to capture ErrorBoundary error:", e);
      }
    };

    window.addEventListener("errorboundary-caught" as any, handleErrorBoundary as EventListener);

    return () => {
      window.removeEventListener("errorboundary-caught" as any, handleErrorBoundary as EventListener);
    };
  }, [isEnabled]);

  // Capture window errors
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") return;

    const handleError = (event: ErrorEvent) => {
      try {
        const errorInfo: ErrorInfo = {
          message: event.message || "Unknown error",
          stack: event.error?.stack,
          route: window.location.pathname + window.location.search,
          timestamp: new Date().toISOString(),
          telegram: {
            available: typeof (window as any).Telegram !== "undefined",
            version: (window as any).Telegram?.WebApp?.version,
            platform: (window as any).Telegram?.WebApp?.platform,
          },
          environment: {
            vercelEnv: process.env.VERCEL_ENV,
            nodeEnv: process.env.NODE_ENV,
          },
          suspectedCause: detectSuspectedCause(event.error),
        };

        setErrors((prev) => [...prev, errorInfo]);
      } catch (e) {
        console.error("[DebugOverlay] Failed to capture error:", e);
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      try {
        const errorInfo: ErrorInfo = {
          message: event.reason?.message || String(event.reason) || "Unhandled promise rejection",
          stack: event.reason?.stack,
          route: window.location.pathname + window.location.search,
          timestamp: new Date().toISOString(),
          telegram: {
            available: typeof (window as any).Telegram !== "undefined",
            version: (window as any).Telegram?.WebApp?.version,
            platform: (window as any).Telegram?.WebApp?.platform,
          },
          environment: {
            vercelEnv: process.env.VERCEL_ENV,
            nodeEnv: process.env.NODE_ENV,
          },
          suspectedCause: detectSuspectedCause(event.reason),
        };

        setErrors((prev) => [...prev, errorInfo]);
      } catch (e) {
        console.error("[DebugOverlay] Failed to capture rejection:", e);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [isEnabled]);

  const detectSuspectedCause = (error: any): string => {
    if (!error) return "unknown";

    const message = String(error.message || "");
    const stack = String(error.stack || "");

    if (message.includes("310") || message.includes("Rendered more hooks")) {
      return "hooks-order-changed";
    }
    if (message.includes("conditional") || stack.includes("conditional")) {
      return "conditional-hook-call";
    }
    if (message.includes("early return") || stack.includes("early return")) {
      return "early-return-before-hooks";
    }
    if (message.includes("use client") || message.includes("client component")) {
      return "missing-use-client";
    }
    if (message.includes("key") || message.includes("remount")) {
      return "key-caused-remount-mismatch";
    }

    return "unknown";
  };

  const copyToClipboard = (text: string, type: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(type);
          setTimeout(() => setCopied(null), 2000);
        }).catch(() => {
          fallbackCopy(text, type);
        });
      } else {
        fallbackCopy(text, type);
      }
    } catch (e) {
      console.error("[DebugOverlay] Failed to copy:", e);
    }
  };

  const fallbackCopy = (text: string, type: string) => {
    try {
      if (typeof document === "undefined") return;

      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      textArea.style.opacity = "0";

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand("copy");
        if (successful) {
          setCopied(type);
          setTimeout(() => setCopied(null), 2000);
        }
      } catch (err) {
        // Ignore
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (e) {
      // Ignore
    }
  };

  if (!isEnabled || errors.length === 0) {
    return null;
  }

  const latestError = errors[errors.length - 1];
  const rawJson = safeStringify(errors, 2);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className="bg-red-50 border-2 border-red-300 rounded-lg shadow-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-red-800">Debug Overlay</h3>
          <button
            onClick={() => setErrors([])}
            className="text-red-600 hover:text-red-800 text-xs"
          >
            Clear
          </button>
        </div>

        <div className="flex border-b border-red-200 mb-2">
          <button
            onClick={() => setActiveTab("summary")}
            className={`flex-1 px-2 py-1 text-xs font-medium ${
              activeTab === "summary"
                ? "text-red-800 border-b-2 border-red-800"
                : "text-red-600"
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab("raw")}
            className={`flex-1 px-2 py-1 text-xs font-medium ${
              activeTab === "raw"
                ? "text-red-800 border-b-2 border-red-800"
                : "text-red-600"
            }`}
          >
            Raw JSON
          </button>
        </div>

        {activeTab === "summary" ? (
          <div className="space-y-2 text-xs">
            <div>
              <span className="font-semibold">Error:</span> {latestError.message}
            </div>
            {latestError.suspectedCause && (
              <div>
                <span className="font-semibold">Suspected Cause:</span> {latestError.suspectedCause}
              </div>
            )}
            {latestError.route && (
              <div>
                <span className="font-semibold">Route:</span> {latestError.route}
              </div>
            )}
            <div>
              <span className="font-semibold">Timestamp:</span> {latestError.timestamp}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => copyToClipboard(latestError.stack || latestError.message, "stack")}
                className="px-2 py-1 bg-red-200 text-red-900 rounded text-xs"
              >
                {copied === "stack" ? "✓ Copied" : "Copy Stack"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(rawJson, "json")}
                className="px-2 py-1 bg-red-200 text-red-900 rounded text-xs"
              >
                {copied === "json" ? "✓ Copied" : "Copy JSON"}
              </button>
            </div>
            <pre className="bg-white p-2 rounded text-xs overflow-auto max-h-64 font-mono">
              {rawJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
