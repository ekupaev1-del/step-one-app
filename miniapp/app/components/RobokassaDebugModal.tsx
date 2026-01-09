"use client";

import { useState, useEffect } from "react";
import { safeStringify } from "../lib/safeStringify";

interface RobokassaDebugData {
  merchantLogin: string;
  outSum: string;
  invoiceId: string;
  isTest: boolean;
  targetUrl: string;
  signatureAlgorithm: string;
  signatureStringMasked: string;
  signatureStringParts: string[];
  signatureValue: string;
  signatureChecks: {
    lengthIs32: boolean;
    lowercase: boolean;
    hexOnly: boolean;
  };
  customParams: {
    raw: Record<string, string>;
    sorted: string[];
    count: number;
  };
  environment: {
    nodeEnv: string;
    vercelEnv: string;
    password1Length: number;
    password1Prefix2: string;
    password1Suffix2: string;
  };
}

interface RobokassaDebugModalProps {
  debugData: RobokassaDebugData;
  error29?: boolean;
  onClose: () => void;
}

export default function RobokassaDebugModal({
  debugData,
  error29 = false,
  onClose,
}: RobokassaDebugModalProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "raw">("summary");
  const [copied, setCopied] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Check if debug mode is enabled - must be unconditional
  useEffect(() => {
    try {
      if (typeof window === "undefined") {
        setShouldRender(false);
        return;
      }
      
      // Check environment variable (client-side only)
      const envDebug = process.env.NEXT_PUBLIC_DEBUG === "1";
      
      // Check URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      const urlDebug = urlParams.get("debug") === "1";
      
      const enabled = envDebug || urlDebug;
      setIsDebugMode(enabled);
      
      // Only render if debug is enabled AND debugData exists
      setShouldRender(enabled && !!debugData);
    } catch (e) {
      // If check fails, disable debug
      setIsDebugMode(false);
      setShouldRender(false);
    }
  }, [debugData]);

  // Early return AFTER all hooks - this is safe
  if (!shouldRender || typeof window === "undefined" || !debugData) {
    return null;
  }

  const copyToClipboard = (text: string, type: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(type);
          setTimeout(() => setCopied(null), 2000);
        }).catch((e) => {
          console.error("Failed to copy to clipboard:", e);
        });
      } else if (typeof document !== "undefined") {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          setCopied(type);
          setTimeout(() => setCopied(null), 2000);
        } catch (e) {
          console.error("Failed to copy to clipboard:", e);
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (e) {
      console.error("Failed to copy to clipboard:", e);
    }
  };

  const rawJson = debugData ? safeStringify(debugData, 2) : "{}";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Payment Debug (Robokassa)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Error 29 Banner */}
        {error29 && (
          <div className="bg-red-50 border-b border-red-200 p-3">
            <div className="text-red-800 font-semibold">
              ⚠️ Robokassa Error 29: SignatureValue mismatch
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("summary")}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === "summary"
                ? "text-accent border-b-2 border-accent"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab("raw")}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === "raw"
                ? "text-accent border-b-2 border-accent"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Raw JSON
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "summary" ? (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Payment Details</h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Target URL:</span>
                    <span className="text-gray-900 font-mono text-xs break-all">
                      {debugData?.targetUrl || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">MerchantLogin:</span>
                    <span className="text-gray-900 font-mono">{debugData?.merchantLogin || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">OutSum:</span>
                    <span className="text-gray-900 font-mono">{debugData?.outSum || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">InvoiceID:</span>
                    <span className="text-gray-900 font-mono">{debugData?.invoiceId || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Recurring:</span>
                    <span className="text-gray-900">{debugData?.isTest ? "Test Mode" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Shp_userId:</span>
                    <span className="text-gray-900 font-mono">
                      {debugData?.customParams?.raw?.Shp_userId || 
                       (debugData?.customParams?.raw && typeof debugData.customParams.raw === 'object' 
                         ? String(debugData.customParams.raw.Shp_userId || "N/A")
                         : "N/A")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Receipt Enabled:</span>
                    <span className="text-gray-900">No</span>
                  </div>
                </div>
              </div>

              {/* Signature Info */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Signature</h3>
                <div
                  className={`bg-gray-50 rounded-lg p-3 space-y-2 text-sm ${
                    error29 ? "border-2 border-red-300 bg-red-50" : ""
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="text-gray-600">SignatureValue:</span>
                    <span className="text-gray-900 font-mono text-xs break-all">
                      {debugData?.signatureValue || "N/A"}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-gray-600 text-xs mb-1">Masked Signature String:</div>
                    <div className="text-gray-900 font-mono text-xs break-all bg-white p-2 rounded">
                      {debugData?.signatureStringMasked || "N/A"}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-gray-600 text-xs mb-1">Signature Parts (in order):</div>
                    <div className="space-y-1">
                      {Array.isArray(debugData?.signatureStringParts) 
                        ? debugData.signatureStringParts.map((part: string, idx: number) => (
                            <div key={idx} className="text-gray-900 font-mono text-xs">
                              {idx + 1}. {String(part || "")}
                            </div>
                          ))
                        : <div className="text-gray-500 text-xs">No signature parts available</div>
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Signature Checks */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Signature Validation</h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Length is 32:</span>
                    <span
                      className={`font-semibold ${
                        debugData?.signatureChecks?.lengthIs32 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {debugData?.signatureChecks?.lengthIs32 ? "✓" : "✗"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Lowercase:</span>
                    <span
                      className={`font-semibold ${
                        debugData?.signatureChecks?.lowercase ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {debugData?.signatureChecks?.lowercase ? "✓" : "✗"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Hex Only:</span>
                    <span
                      className={`font-semibold ${
                        debugData?.signatureChecks?.hexOnly ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {debugData?.signatureChecks?.hexOnly ? "✓" : "✗"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Environment */}
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Environment</h3>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Node Env:</span>
                    <span className="text-gray-900">{debugData?.environment?.nodeEnv || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Vercel Env:</span>
                    <span className="text-gray-900">{debugData?.environment?.vercelEnv || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Password1 Length:</span>
                    <span className="text-gray-900">{debugData?.environment?.password1Length ?? "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Password1 Prefix (2 chars):</span>
                    <span className="text-gray-900 font-mono">
                      {debugData?.environment?.password1Prefix2 || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Password1 Suffix (2 chars):</span>
                    <span className="text-gray-900 font-mono">
                      {debugData?.environment?.password1Suffix2 || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(rawJson, "json")}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 text-sm font-medium"
                >
                  {copied === "json" ? "✓ Copied!" : "Copy JSON"}
                </button>
                <button
                  onClick={() => copyToClipboard(debugData.signatureStringMasked, "signature")}
                  className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 text-sm font-medium"
                >
                  {copied === "signature" ? "✓ Copied!" : "Copy Signature String"}
                </button>
              </div>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                {rawJson}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
