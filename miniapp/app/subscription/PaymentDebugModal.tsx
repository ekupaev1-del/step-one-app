'use client';

import { useState } from 'react';

interface DebugInfo {
  version?: string;
  timestamp?: string;
  mode?: string;
  robokassa?: {
    targetUrl?: string;
    merchantLogin?: string;
    outSum?: string;
    invoiceId?: string;
    description?: string;
    hasRecurring?: boolean;
    recurringValue?: string;
    shp?: {
      raw?: Record<string, string>;
      sortedList?: string[];
    };
    receipt?: {
      enabled?: boolean;
      rawJson?: string | null;
      encoded?: string | null;
      encodedLength?: number;
    };
    signature?: {
      algo?: string;
      signatureStringMasked?: string;
      signatureStringFull_DO_NOT_LOG?: string | null;
      signatureValue?: string;
      isLowercase?: boolean;
      isHex32?: boolean;
    };
    form?: {
      fieldsSent?: Record<string, string>;
      fieldOrder?: string[];
    };
  };
  env?: {
    vercelEnv?: string;
    nodeEnv?: string;
    receiptEnabled?: boolean;
    pass1Len?: number;
    pass1Prefix2?: string;
    pass1Suffix2?: string;
  };
  error?: string;
  stage?: string;
  fullResponse?: any;
}

interface PaymentDebugModalProps {
  debugInfo: DebugInfo | null;
  onClose: () => void;
  errorMessage?: string | null;
}

export default function PaymentDebugModal({ debugInfo, onClose, errorMessage }: PaymentDebugModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'raw'>('summary');

  if (!debugInfo) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('✅ Скопировано в буфер обмена!');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('✅ Скопировано!');
      } catch (e) {
        alert('❌ Ошибка копирования');
      }
      document.body.removeChild(textarea);
    });
  };

  const robokassa = debugInfo.robokassa;
  const signatureString = robokassa?.signature?.signatureStringMasked || '';

  // Verification checklist
  const checklist = {
    hasInvoiceID: robokassa?.form?.fieldsSent?.InvoiceID !== undefined && robokassa?.form?.fieldsSent?.InvId === undefined,
    hasRecurring: robokassa?.hasRecurring === true && robokassa?.recurringValue === 'true',
    signatureUsesInvoiceID: robokassa?.signature?.signatureStringMasked?.includes(robokassa?.invoiceId || '') || false,
    shpInForm: robokassa?.form?.fieldsSent?.Shp_userId !== undefined,
    shpInSignature: robokassa?.shp?.sortedList?.some(p => p.startsWith('Shp_userId=')) || false,
    signatureIsHex32: robokassa?.signature?.isHex32 === true,
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Payment Debug</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Error message if present */}
        {errorMessage && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200">
            <p className="text-red-800 font-semibold">{errorMessage}</p>
            {debugInfo.stage && (
              <p className="text-red-600 text-sm mt-1">Stage: {debugInfo.stage}</p>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="px-6 py-2 border-b border-gray-200 flex gap-4">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'summary'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'raw'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Raw JSON
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'summary' ? (
            <div className="space-y-4">
              {/* Verification Checklist */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-gray-900 mb-3">Verification Checklist</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={checklist.hasInvoiceID ? 'text-green-600' : 'text-red-600'}>
                      {checklist.hasInvoiceID ? '✅' : '❌'}
                    </span>
                    <span>Form includes InvoiceID (NOT InvId)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={checklist.hasRecurring ? 'text-green-600' : 'text-red-600'}>
                      {checklist.hasRecurring ? '✅' : '❌'}
                    </span>
                    <span>Form includes Recurring=true</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={checklist.signatureUsesInvoiceID ? 'text-green-600' : 'text-red-600'}>
                      {checklist.signatureUsesInvoiceID ? '✅' : '❌'}
                    </span>
                    <span>Signature string uses InvoiceID</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={checklist.shpInForm && checklist.shpInSignature ? 'text-green-600' : 'text-red-600'}>
                      {checklist.shpInForm && checklist.shpInSignature ? '✅' : '❌'}
                    </span>
                    <span>Shp_userId appears in BOTH form and signature</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={checklist.signatureIsHex32 ? 'text-green-600' : 'text-red-600'}>
                      {checklist.signatureIsHex32 ? '✅' : '❌'}
                    </span>
                    <span>SignatureValue is lowercase hex 32 chars</span>
                  </div>
                </div>
              </div>

              {/* Key Fields */}
              <div className="space-y-3">
                <h3 className="font-bold text-gray-900">Key Fields</h3>
                
                {robokassa?.targetUrl && (
                  <div>
                    <span className="text-gray-600 font-medium">Target URL:</span>
                    <div className="text-gray-900 break-all mt-1">{robokassa.targetUrl}</div>
                  </div>
                )}

                {robokassa?.outSum && (
                  <div>
                    <span className="text-gray-600 font-medium">OutSum:</span>
                    <div className="text-gray-900 mt-1">{robokassa.outSum}</div>
                  </div>
                )}

                {robokassa?.invoiceId && (
                  <div>
                    <span className="text-gray-600 font-medium">InvoiceID:</span>
                    <div className="text-gray-900 mt-1">{robokassa.invoiceId}</div>
                  </div>
                )}

                {robokassa?.hasRecurring !== undefined && (
                  <div>
                    <span className="text-gray-600 font-medium">Recurring:</span>
                    <div className={`mt-1 ${robokassa.hasRecurring ? 'text-green-600' : 'text-red-600'}`}>
                      {robokassa.recurringValue || String(robokassa.hasRecurring)}
                    </div>
                  </div>
                )}

                {robokassa?.shp?.raw?.Shp_userId && (
                  <div>
                    <span className="text-gray-600 font-medium">Shp_userId:</span>
                    <div className="text-gray-900 mt-1">{robokassa.shp.raw.Shp_userId}</div>
                  </div>
                )}

                {robokassa?.signature?.signatureValue && (
                  <div>
                    <span className="text-gray-600 font-medium">SignatureValue:</span>
                    <div className="text-gray-900 font-mono text-sm break-all mt-1">
                      {robokassa.signature.signatureValue}
                    </div>
                  </div>
                )}

                {signatureString && (
                  <div>
                    <span className="text-gray-600 font-medium">Signature String (masked):</span>
                    <div className="text-gray-900 font-mono text-xs break-all mt-1 bg-gray-50 p-2 rounded">
                      {signatureString}
                    </div>
                    <button
                      onClick={() => copyToClipboard(signatureString)}
                      className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Copy Signature String
                    </button>
                  </div>
                )}

                {robokassa?.receipt?.enabled !== undefined && (
                  <div>
                    <span className="text-gray-600 font-medium">Receipt Enabled:</span>
                    <div className={`mt-1 ${robokassa.receipt.enabled ? 'text-green-600' : 'text-gray-600'}`}>
                      {robokassa.receipt.enabled ? 'Yes' : 'No'}
                    </div>
                    {robokassa.receipt.enabled && robokassa.receipt.encodedLength !== undefined && (
                      <div className="text-sm text-gray-500 mt-1">
                        Encoded length: {robokassa.receipt.encodedLength} chars
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(debugInfo, null, 2))}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Copy JSON
                </button>
                {signatureString && (
                  <button
                    onClick={() => copyToClipboard(signatureString)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Copy Signature String
                  </button>
                )}
              </div>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs font-mono">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

