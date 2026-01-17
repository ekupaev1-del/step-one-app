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
    payloadHasUserId?: boolean;
    payloadUserIdValue?: number;
    headers?: Record<string, string>;
  };
  serverDebug?: any;
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
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Check if debug should be shown
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const debugKey = urlParams?.get("debugKey");
  const debugEnabled = 
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_PAYMENTS === "true") ||
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production") ||
    !!debugKey;

  // Show panel if error exists OR if debug is enabled and we have payment info
  if (!error && !debugEnabled) {
    return null;
  }

  // If no error but debug enabled, show minimal info
  if (!error) {
    return null; // Will be handled by success case in subscription page
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

  // Extract payment URL from response if available
  const paymentUrl = error.apiResponse?.body?.paymentUrl;

  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(safeError, null, 2));
      setCopySuccess("debug");
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCopyPaymentUrl = async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopySuccess("url");
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Extract key debug info for quick view
  const userIdResolution = error.userIdResolution;
  const userIdValue = userIdResolution?.userId ?? error.userId?.value ?? null;
  const userIdSource = userIdResolution?.source ?? error.userId?.source ?? "unknown";
  const telegramInfo = error.clientContext?.telegram;
  const robokassaInfo = error.serverDebug?.robokassa;

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

      {/* Telegram Warning */}
      {telegramInfo && !telegramInfo.initDataPresent && (
        <div className="mb-2 px-3 py-2 bg-yellow-50 border border-yellow-300 rounded text-yellow-700 text-xs">
          ⚠️ <strong>Warning:</strong> Telegram.WebApp.initData is missing. This may happen if opened outside Telegram (desktop browser). Payments will still work using URL userId parameter.
        </div>
      )}

      {/* Quick Info Summary */}
      <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs">
        <div className="font-semibold mb-1">Quick Info:</div>
        <div>userId: {userIdValue ?? "null"} (source: {userIdSource})</div>
        {telegramInfo && (
          <div>Telegram: {telegramInfo.webAppAvailable ? "✓ Available" : "✗ Not available"} | initData: {telegramInfo.initDataPresent ? `✓ (${telegramInfo.initDataLength} chars)` : "✗ Missing"}</div>
        )}
        {error.apiRequest && (
          <div>Request: {error.apiRequest.method} {error.apiRequest.endpoint} | userId in body: {error.apiRequest.payloadHasUserId ? "✓" : "✗"}</div>
        )}
        {error.apiResponse && (
          <div>Response: {error.apiResponse.status} {error.apiResponse.statusText}</div>
        )}
        {robokassaInfo && (
          <div>Robokassa: IsTest={robokassaInfo.isTest ? "1" : "0"} | OutSum={robokassaInfo.outSum} | Shp params: {robokassaInfo.sortedShpKeys.length}</div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mb-2 flex gap-2">
        <button
          onClick={handleCopyDebug}
          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
        >
          {copySuccess === "debug" ? "✓ Copied!" : "📋 Copy Debug JSON"}
        </button>
        {paymentUrl && (
          <button
            onClick={handleCopyPaymentUrl}
            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
          >
            {copySuccess === "url" ? "✓ Copied!" : "🔗 Copy Payment URL"}
          </button>
        )}
      </div>

      {/* Debug Details */}
      <details
        className="border border-gray-300 rounded-lg bg-gray-50"
        open={true}
      >
        <summary className="px-4 py-2 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-100 select-none">
          🔍 Debug Details (Full JSON)
        </summary>
        <div className="px-4 py-3 border-t border-gray-300 bg-white">
          <pre className="text-xs overflow-auto max-h-96 bg-gray-50 p-3 rounded border border-gray-200">
            {JSON.stringify(safeError, null, 2)}
          </pre>
        </div>
      </details>

      {/* Robokassa Debug Section (if available) */}
      {robokassaInfo && (
        <details
          className="mt-2 border border-orange-300 rounded-lg bg-orange-50"
          open={true}
        >
          <summary className="px-4 py-2 cursor-pointer text-sm font-semibold text-orange-700 hover:bg-orange-100 select-none">
            🔐 Robokassa Signature Debug
          </summary>
          <div className="px-4 py-3 border-t border-orange-300 bg-white">
            <div className="text-xs space-y-1">
              <div><strong>OutSum:</strong> {robokassaInfo.outSum}</div>
              <div><strong>InvId:</strong> {robokassaInfo.invId}</div>
              <div><strong>MerchantLogin:</strong> {robokassaInfo.mrchLogin}</div>
              <div><strong>IsTest:</strong> {robokassaInfo.isTest ? "1 (TEST MODE)" : "0 (PRODUCTION)"}</div>
              <div><strong>Shp Params:</strong> {JSON.stringify(robokassaInfo.shpParams, null, 2)}</div>
              <div><strong>Sorted Shp Keys:</strong> {robokassaInfo.sortedShpKeys.join(", ")}</div>
              <div className="mt-2 p-2 bg-gray-100 rounded font-mono text-xs break-all">
                <strong>String to Sign:</strong><br />
                {robokassaInfo.stringToSign}
              </div>
              <div><strong>Signature (masked):</strong> {robokassaInfo.signatureMasked}</div>
              <div className="mt-2 p-2 bg-gray-100 rounded font-mono text-xs break-all">
                <strong>Final URL (masked):</strong><br />
                {robokassaInfo.finalUrlMasked}
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
