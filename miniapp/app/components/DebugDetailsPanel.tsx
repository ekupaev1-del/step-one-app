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
  userIdResolution?: {
    userId: number | null;
    source: string;
    candidates: Record<string, any>;
    notes: string[];
  };
  paymentState?: {
    selectedMethod: "card" | "sbp" | null;
    processingPayment: boolean;
    showPaymentMethod: boolean;
  };
  lastApiRequestId?: string | null;
  lastApiResponse?: {
    status: number;
    body: any;
  };
}

interface DebugDetailsPanelProps {
  error: DebugErrorDetails | null;
}

/**
 * Debug panel component that shows detailed error information
 * TEMPORARILY: Always visible when error exists (for troubleshooting)
 */
export function DebugDetailsPanel({ error }: DebugDetailsPanelProps) {
  // TEMPORARY: Force show debug panel always when error exists
  if (!error) {
    return null;
  }

  // Mask secrets in the error object
  const safeError = maskSecretsInObject(error);

  // Get build stamp - try multiple sources
  const buildId =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA) ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BUILD_ID) ||
    "not-set";
  const buildIdShort = buildId !== "not-set" ? buildId.substring(0, 7) : "not-set";
  const currentTime = new Date().toISOString();

  return (
    <div className="mt-4">
      {/* DEBUG ENABLED Badge */}
      <div className="mb-2 px-3 py-1 bg-red-100 border border-red-300 rounded text-red-700 text-xs font-bold">
        🔴 DEBUG ENABLED
      </div>
      
      {/* Build Info */}
      <div className="mb-2 px-3 py-1 bg-gray-100 border border-gray-300 rounded text-gray-600 text-xs">
        <div>Build: {buildIdShort} {buildId !== "not-set" && `(${buildId})`}</div>
        <div>Time: {currentTime}</div>
        <div>Env: {typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "unknown") : "unknown"}</div>
      </div>

      {/* Debug Details */}
      <details
        className="border border-gray-300 rounded-lg bg-gray-50"
        open={true}
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
    </div>
  );
}
