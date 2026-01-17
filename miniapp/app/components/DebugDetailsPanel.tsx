"use client";

import { useState } from "react";
import { ClientDebugContext, maskSecretsInObject } from "@/lib/debugContext";

export interface DebugErrorDetails {
  errorType: "USER_ID_MISSING" | "API_ERROR" | "CLIENT_ERROR" | "UNKNOWN";
  message: string;
  requestId?: string;
  timestamp: string;
  duration?: number;
  clientContext?: ClientDebugContext;
  apiRequest?: {
    endpoint: string;
    method: string;
    payloadKeys?: string[];
    headers?: Record<string, string>;
  };
  apiResponse?: {
    status: number;
    statusText?: string;
    body?: any;
  };
  serverError?: {
    code?: string;
    message?: string;
    details?: any;
  };
  userId?: {
    value: number | null;
    source: string;
    derivation?: string;
  };
}

interface DebugDetailsPanelProps {
  error: DebugErrorDetails | null;
}

/**
 * Debug panel component that shows detailed error information
 * Only visible in non-production or when NEXT_PUBLIC_DEBUG_PAYMENTS=true
 */
export function DebugDetailsPanel({ error }: DebugDetailsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Check if debug panel should be shown
  // NEXT_PUBLIC_ vars are available in client components in Next.js
  const debugPaymentsFlag =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_DEBUG_PAYMENTS === "true";
  const isDevelopment =
    typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  const shouldShow = debugPaymentsFlag || isDevelopment;

  if (!shouldShow || !error) {
    return null;
  }

  // Mask secrets in the error object
  const safeError = maskSecretsInObject(error);

  return (
    <details
      className="mt-4 border border-gray-300 rounded-lg bg-gray-50"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="px-4 py-2 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-100 select-none">
        🔍 Debug Details
      </summary>
      <div className="px-4 py-3 border-t border-gray-300 bg-white">
        <pre className="text-xs overflow-auto max-h-96 bg-gray-50 p-3 rounded border border-gray-200">
          {JSON.stringify(safeError, null, 2)}
        </pre>
      </div>
    </details>
  );
}
