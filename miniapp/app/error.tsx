"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Something went wrong
        </h1>

        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            {error.message || "An unexpected error occurred"}
          </p>
        </div>

        <div className="space-y-3 mb-4">
          <button
            onClick={reset}
            className="w-full px-4 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 transition-colors"
          >
            Try again
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

        <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
          {typeof window !== "undefined" && window.location.href ? (
            <div className="break-all">URL: {window.location.href.substring(0, 100)}...</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
