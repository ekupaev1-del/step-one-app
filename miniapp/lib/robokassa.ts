/**
 * Robokassa payment utilities
 * Fixed implementation for trial payment creation
 */

import { createHash } from 'crypto';

export interface RobokassaConfig {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest?: boolean;
}

export interface Receipt {
  sno: string;
  items: Array<{
    name: string;
    quantity: number;
    sum: number;
    payment_method: string;
    payment_object: string;
    tax: string;
  }>;
}

export type PaymentMode = 'minimal' | 'recurring';

/**
 * Calculate MD5 signature for Robokassa
 */
function calculateSignature(...args: (string | number)[]): string {
  const signatureString = args.map(arg => String(arg)).join(':');
  return createHash('md5').update(signatureString).digest('hex').toLowerCase();
}

/**
 * Build custom parameters (Shp_*) for signature and form
 * Returns array of strings in format "Shp_key=value" sorted alphabetically
 */
function buildCustomParams(formFields: Record<string, string>): string[] {
  const customParams: string[] = [];
  for (const [key, value] of Object.entries(formFields)) {
    if (key.startsWith('Shp_')) {
      customParams.push(`${key}=${value}`);
    }
  }
  // Sort alphabetically for stable order
  return customParams.sort();
}

/**
 * Generate Receipt for fiscalization (54-FZ)
 * For Robocheki SMZ, use "npd" (налог на профессиональный доход)
 * 
 * @param amount - Payment amount (must match OutSum exactly, e.g., 1.00)
 * @returns Receipt object
 */
export function generateReceipt(amount: number): Receipt {
  return {
    sno: 'npd', // НПД (налог на профессиональный доход) for Robocheki SMZ
    items: [
      {
        name: 'Trial subscription 3 days',
        quantity: 1,
        sum: amount, // MUST equal OutSum exactly (1.00)
        payment_method: 'full_payment',
        payment_object: 'service',
        tax: 'none',
      },
    ],
  };
}

/**
 * Sign minimal payment (no Receipt, no Recurring)
 * Signature: MD5(MerchantLogin:OutSum:InvId:Password1:Shp_userId=<value>)
 * Shp_* params are included ONLY if present in formFields
 */
export function signMinimal(
  config: RobokassaConfig,
  outSum: string,
  invId: number,
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureFull: string } {
  // Build signature parts
  const parts: (string | number)[] = [
    config.merchantLogin,
    outSum,
    invId,
    config.password1,
  ];
  
  // Append custom params (Shp_*) if any
  if (customParams.length > 0) {
    parts.push(...customParams);
  }
  
  const signatureBase = customParams.length > 0
    ? `${config.merchantLogin}:${outSum}:${invId}:${customParams.join(':')}`
    : `${config.merchantLogin}:${outSum}:${invId}`;
  
  const signatureFull = customParams.length > 0
    ? `${signatureBase}:${config.password1}`
    : `${signatureBase}:${config.password1}`;
  
  const signature = calculateSignature(...parts);
  
  return { signature, signatureBase, signatureFull };
}

/**
 * Sign payment with Receipt (recurring mode)
 * Signature: MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1:Shp_userId=<value>)
 * Shp_* params are included ONLY if present in formFields
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer)
 * @param receiptEncoded - Receipt JSON stringified and encoded with encodeURIComponent ONCE
 * @param customParams - Array of custom params in format "Shp_key=value"
 * @returns Signature and signature base (without password)
 */
export function signWithReceipt(
  config: RobokassaConfig,
  outSum: string,
  invId: number,
  receiptEncoded: string,
  customParams: string[] = []
): { signature: string; signatureBase: string; signatureFull: string } {
  // Build signature parts
  const parts: (string | number)[] = [
    config.merchantLogin,
    outSum,
    invId,
    receiptEncoded,
    config.password1,
  ];
  
  // Append custom params (Shp_*) if any
  if (customParams.length > 0) {
    parts.push(...customParams);
  }
  
  const signatureBase = customParams.length > 0
    ? `${config.merchantLogin}:${outSum}:${invId}:${receiptEncoded}:${customParams.join(':')}`
    : `${config.merchantLogin}:${outSum}:${invId}:${receiptEncoded}`;
  
  const signatureFull = customParams.length > 0
    ? `${signatureBase}:${config.password1}`
    : `${signatureBase}:${config.password1}`;
  
  const signature = calculateSignature(...parts);
  
  return { signature, signatureBase, signatureFull };
}

/**
 * HTML escape for attribute values (does NOT re-encode URL-encoded strings)
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate HTML form for Robokassa payment
 * 
 * @param config - Robokassa configuration
 * @param outSum - Payment amount as string (e.g., "1.00")
 * @param invId - Unique InvId (integer, <= 2_000_000_000)
 * @param description - Payment description (ASCII, no emojis)
 * @param mode - Payment mode: 'minimal' or 'recurring'
 * @param receipt - Receipt object (only used in recurring mode)
 * @param telegramUserId - Telegram user ID (for Shp_userId)
 * @param debugMode - If true, return debug HTML instead of auto-submitting
 * @returns HTML form and debug info
 */
export function generatePaymentForm(
  config: RobokassaConfig,
  outSum: string,
  invId: number,
  description: string,
  mode: PaymentMode,
  receipt?: Receipt,
  telegramUserId?: number,
  debugMode: boolean = true // Default to true for debugging
): { html: string; debug: any } {
  const baseUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  
  let signature: string;
  let signatureBase: string;
  let signatureFull: string;
  let encodedReceipt: string | undefined;
  let receiptJson: string | undefined;
  
  // Build form fields - CRITICAL: Use exact parameter names Robokassa expects
  // IMPORTANT: MerchantLogin must be exactly "steopone" (case-sensitive)
  const formFields: Record<string, string> = {
    MerchantLogin: config.merchantLogin, // Must match exactly from Robokassa cabinet
    OutSum: outSum, // Must be "1.00" (string)
    InvId: String(invId), // Use InvId (NOT InvoiceID), must be integer <= 2_000_000_000
    Description: description, // ASCII, no emojis
  };
  
  // Add custom params (Shp_*) BEFORE calculating signature
  if (telegramUserId) {
    formFields.Shp_userId = String(telegramUserId);
  }
  
  // Build custom params array for signature (sorted alphabetically)
  const customParams = buildCustomParams(formFields);
  
  if (mode === 'minimal') {
    // Minimal mode: no Receipt, no Recurring
    const signResult = signMinimal(config, outSum, invId, customParams);
    signature = signResult.signature;
    signatureBase = signResult.signatureBase;
    signatureFull = signResult.signatureFull;
  } else {
    // Recurring mode: with Receipt and Recurring=true
    if (!receipt) {
      throw new Error('Receipt is required for recurring mode');
    }
    
    // Step 1: JSON.stringify receipt
    receiptJson = JSON.stringify(receipt);
    
    // Step 2: encodeURIComponent ONCE (no double encoding)
    encodedReceipt = encodeURIComponent(receiptJson);
    
    // Step 3: Sign with encoded receipt and custom params
    const signResult = signWithReceipt(config, outSum, invId, encodedReceipt, customParams);
    signature = signResult.signature;
    signatureBase = signResult.signatureBase;
    signatureFull = signResult.signatureFull;
    
    // Add Receipt and Recurring to form
    formFields.Receipt = encodedReceipt;
    formFields.Recurring = 'true';
  }
  
  formFields.SignatureValue = signature;
  
  if (config.isTest) {
    formFields.IsTest = '1';
  }
  
  // Build comprehensive debug info
  const debugInfo = {
    mode,
    merchantLogin: config.merchantLogin,
    outSum,
    outSumType: typeof outSum,
    invId,
    invIdType: typeof invId,
    invIdString: String(invId),
    description,
    isTest: config.isTest,
    isTestIncluded: config.isTest,
    robokassaTestMode: process.env.ROBOKASSA_TEST_MODE,
    baseUrl,
    signatureBaseWithoutPassword: signatureBase,
    signatureFullWithPassword: signatureFull.replace(config.password1, '[PASSWORD1_HIDDEN]'),
    signatureValue: signature,
    signatureLength: signature.length,
    customParams: customParams, // Show which Shp_* params were included in signature
    formFields: Object.fromEntries(
      Object.entries(formFields).map(([k, v]) => [
        k,
        k === 'Receipt' ? `[encoded, length: ${v.length}, preview: ${v.substring(0, 100)}...]` : v
      ])
    ),
    formFieldsRaw: formFields, // Full raw values for debugging
    receiptRaw: receiptJson,
    receiptRawLength: receiptJson?.length || 0,
    receiptEncoded: encodedReceipt,
    receiptEncodedLength: encodedReceipt?.length || 0,
    receiptEncodedPreview: encodedReceipt ? encodedReceipt.substring(0, 100) + '...' : undefined,
    receiptFull: receipt,
    telegramUserId: telegramUserId || undefined,
    timestamp: new Date().toISOString(),
  };
  
  // Build debug JSON string for copying
  const debugJson = JSON.stringify(debugInfo, null, 2);
  
  // Build HTML with single copy button
  let formHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Robokassa Payment Debug</title>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      padding: 20px; 
      background: #0a0a0a; 
      color: #e0e0e0; 
      margin: 0;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #00ff88; margin-bottom: 10px; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .copy-all-btn { 
      background: #00ff88; 
      color: #000; 
      padding: 20px 40px; 
      font-size: 18px; 
      font-weight: bold;
      border: none; 
      border-radius: 8px; 
      cursor: pointer; 
      margin: 20px 0;
      width: 100%;
      box-shadow: 0 4px 15px rgba(0, 255, 136, 0.3);
      transition: all 0.3s;
    }
    .copy-all-btn:hover { 
      background: #00cc6a; 
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
    }
    .copy-all-btn:active { transform: translateY(0); }
    button { 
      background: #0066cc; 
      color: white; 
      padding: 15px 30px; 
      font-size: 16px; 
      border: none; 
      border-radius: 5px; 
      cursor: pointer; 
      margin: 10px 5px 10px 0;
      font-weight: 600;
    }
    button:hover { background: #0052a3; }
    button.danger { background: #cc0000; }
    button.danger:hover { background: #aa0000; }
    button.success { background: #00aa00; }
    button.success:hover { background: #008800; }
    .debug-section { 
      background: #1a1a1a; 
      padding: 20px; 
      margin: 15px 0; 
      border-radius: 8px; 
      border: 1px solid #333; 
    }
    .debug-section h3 { 
      margin-top: 0; 
      color: #00ff88; 
    }
    pre { 
      background: #000; 
      padding: 15px; 
      border-radius: 5px; 
      overflow-x: auto; 
      font-size: 13px;
      line-height: 1.5;
      border: 1px solid #333;
      max-height: 400px;
      overflow-y: auto;
    }
    .form-preview {
      background: #1a1a1a;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
      border: 1px solid #333;
    }
    .form-field {
      margin: 8px 0;
      padding: 8px;
      background: #0a0a0a;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
    }
    .form-field-name {
      color: #00ff88;
      font-weight: bold;
    }
    .form-field-value {
      color: #e0e0e0;
      word-break: break-all;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
      margin-left: 10px;
    }
    .status-test { background: #ffaa00; color: #000; }
    .status-prod { background: #00aa00; color: #fff; }
    .status-minimal { background: #0066cc; color: #fff; }
    .status-recurring { background: #aa00aa; color: #fff; }
    .error-info {
      background: #2a1a1a;
      border-left: 4px solid #ff4444;
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
    }
    .error-info h4 {
      color: #ff4444;
      margin-top: 0;
    }
    .check-item {
      margin: 5px 0;
      padding: 5px;
      background: #1a1a1a;
      border-radius: 3px;
    }
    .check-ok { border-left: 3px solid #00ff88; }
    .check-fail { border-left: 3px solid #ff4444; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Robokassa Payment Debug</h1>
    <div class="subtitle">
      Mode: <span class="status-badge status-${mode}">${mode.toUpperCase()}</span> 
      ${config.isTest ? '<span class="status-badge status-test">TEST MODE</span>' : '<span class="status-badge status-prod">PRODUCTION</span>'}
    </div>
    
    <button class="copy-all-btn" onclick="copyAllDebugInfo()">
      📋 СКОПИРОВАТЬ ВСЮ DEBUG ИНФОРМАЦИЮ (ОДНИМ КЛИКОМ)
    </button>
    
    <div class="error-info">
      <h4>⚠️ Robokassa Error 26 - Диагностика</h4>
      <p><strong>Типичные причины:</strong></p>
      <ul>
        <li>Неправильный расчет подписи (Shp_* параметры должны быть включены)</li>
        <li>Неправильные имена параметров (должно быть InvId, не InvoiceID)</li>
        <li>Проблемы с кодированием Receipt (двойное кодирование или неправильный формат)</li>
        <li>Несоответствие формата OutSum (должно быть "1.00", не "1.000000")</li>
        <li>Отсутствие обязательных полей</li>
        <li>Несоответствие Password1</li>
        <li>MerchantLogin не совпадает с идентификатором в кабинете Robokassa (case-sensitive, должно быть "steopone")</li>
      </ul>
      <p><strong>Проверки:</strong></p>
      <div id="checks"></div>
    </div>
    
    <div class="debug-section">
      <h3>💳 Payment Form</h3>
      <form id="robokassa-form" method="POST" action="${baseUrl}">`;
  
  for (const [name, value] of Object.entries(formFields)) {
    const escapedValue = name === 'Receipt' ? value : escapeHtmlAttribute(value);
    formHtml += `\n        <input type="hidden" name="${name}" value="${escapedValue}">`;
  }
  
  formHtml += `
      </form>
      <div style="margin-top: 15px;">
        <button class="success" onclick="document.getElementById('robokassa-form').submit()">💳 Pay Now (Submit to Robokassa)</button>
        <button class="danger" onclick="if(confirm('Are you sure?')) window.close()">❌ Cancel</button>
      </div>
      
      <div class="form-preview" style="margin-top: 20px;">
        <strong>Form Fields (${Object.keys(formFields).length} fields):</strong>`;
  
  for (const [name, value] of Object.entries(formFields)) {
    const displayValue = name === 'Receipt' 
      ? `[URL-encoded, length: ${value.length}] ${value.substring(0, 100)}...`
      : value;
    formHtml += `
        <div class="form-field">
          <span class="form-field-name">${name}:</span> 
          <span class="form-field-value">${escapeHtmlAttribute(displayValue)}</span>
        </div>`;
  }
  
  const signatureFormula = mode === 'minimal'
    ? (customParams.length > 0 
        ? `MD5(MerchantLogin:OutSum:InvId:Password1:${customParams.join(':')})`
        : 'MD5(MerchantLogin:OutSum:InvId:Password1)')
    : (customParams.length > 0
        ? `MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1:${customParams.join(':')})`
        : 'MD5(MerchantLogin:OutSum:InvId:ReceiptEncoded:Password1)');
  
  formHtml += `
      </div>
    </div>
    
    <div class="debug-section">
      <h3>🔐 Signature Calculation</h3>
      <pre>Formula: ${signatureFormula}

Signature Base (without password):
${signatureBase}

Custom Params (Shp_*) included in signature:
${customParams.length > 0 ? customParams.join(', ') : 'None'}

Signature Value:
${signature}

Parts:
${mode === 'minimal' 
  ? `- MerchantLogin: ${config.merchantLogin}\n- OutSum: ${outSum}\n- InvId: ${invId}${customParams.length > 0 ? '\n- ' + customParams.join('\n- ') : ''}`
  : `- MerchantLogin: ${config.merchantLogin}\n- OutSum: ${outSum}\n- InvId: ${invId}\n- ReceiptEncoded: ${encodedReceipt?.substring(0, 100)}...${customParams.length > 0 ? '\n- ' + customParams.join('\n- ') : ''}`}
</pre>
    </div>`;
  
  if (mode === 'recurring' && receiptJson) {
    formHtml += `
    <div class="debug-section">
      <h3>📄 Receipt Details</h3>
      <pre>Raw JSON:
${escapeHtmlAttribute(receiptJson)}

Encoded (encodeURIComponent):
${escapeHtmlAttribute(encodedReceipt || 'N/A')}

Length: ${encodedReceipt?.length || 0} characters
Item Sum: ${receipt?.items[0]?.sum}
OutSum: ${outSum}
Match: ${receipt?.items[0]?.sum === parseFloat(outSum) ? '✅ YES' : '❌ NO'}
</pre>
    </div>`;
  }
  
  formHtml += `
    <div class="debug-section">
      <h3>📋 Full Debug JSON (для анализа)</h3>
      <pre id="debug-json">${escapeHtmlAttribute(debugJson)}</pre>
    </div>
    
    <script>
      // Render checks
      const checks = ${JSON.stringify({
        invIdIsNumber: typeof invId === 'number',
        invIdWithinRange: invId <= 2000000000,
        outSumIsString: typeof outSum === 'string',
        outSumFormat: outSum === '1.00',
        signatureLength: signature.length === 32,
        receiptEncodedOnce: mode === 'minimal' || (encodedReceipt && !encodedReceipt.includes('%25')),
        formHasInvId: 'InvId' in formFields,
        formHasSignatureValue: 'SignatureValue' in formFields,
        merchantLoginSet: config.merchantLogin && config.merchantLogin.length > 0,
        merchantLoginIsSteopone: config.merchantLogin === 'steopone',
        shpUserIdInForm: 'Shp_userId' in formFields,
        shpUserIdInSignature: customParams.length > 0 && customParams.some(p => p.startsWith('Shp_userId=')),
      })};
      const checksHtml = Object.entries(checks).map(([key, value]) => {
        const className = value ? 'check-ok' : 'check-fail';
        const icon = value ? '✅' : '❌';
        return \`<div class="check-item \${className}">\${icon} \${key}: \${value}</div>\`;
      }).join('');
      document.getElementById('checks').innerHTML = checksHtml;
      
      function copyAllDebugInfo() {
        const debugData = ${JSON.stringify(debugInfo)};
        const text = JSON.stringify(debugData, null, 2);
        
        navigator.clipboard.writeText(text).then(() => {
          alert('✅ Вся debug информация скопирована в буфер обмена!\\n\\nТеперь можете вставить в любой текстовый редактор для анализа.');
        }).catch(err => {
          // Fallback for older browsers
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand('copy');
            alert('✅ Вся debug информация скопирована!');
          } catch (e) {
            alert('❌ Не удалось скопировать. Попробуйте выделить текст вручную.');
          }
          document.body.removeChild(textarea);
        });
      }
    </script>
  </div>
</body>
</html>`;
  
  return {
    html: formHtml,
    debug: debugInfo,
  };
}

/**
 * Get Robokassa config from environment variables
 * IMPORTANT: MerchantLogin must be exactly "steopone" (case-sensitive)
 */
export function getRobokassaConfig(): RobokassaConfig {
  const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
  const password1 = process.env.ROBOKASSA_PASSWORD1;
  const password2 = process.env.ROBOKASSA_PASSWORD2;

  if (!merchantLogin || !password1 || !password2) {
    throw new Error(
      'Robokassa credentials missing. Set ROBOKASSA_MERCHANT_LOGIN, ROBOKASSA_PASSWORD1, ROBOKASSA_PASSWORD2'
    );
  }

  // TEMP DEBUG: Log merchantLogin to verify it's "steopone"
  console.log('[robokassa] TEMP DEBUG: merchantLogin from env:', merchantLogin);

  return {
    merchantLogin, // Use exactly as from env (must be "steopone")
    password1,
    password2,
    isTest: process.env.ROBOKASSA_TEST_MODE === 'true',
  };
}

/**
 * Generate safe InvId (<= 2_000_000_000)
 * Uses timestamp modulo to ensure it's within safe range
 */
export function generateSafeInvId(): number {
  const maxInvId = 2_000_000_000;
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  
  // Use timestamp % maxInvId + random, then ensure it's within range
  const invId = (timestamp % maxInvId) + random;
  
  // If it exceeds max, wrap around
  return invId > maxInvId ? invId % maxInvId : invId;
}
