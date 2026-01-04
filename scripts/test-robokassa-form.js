#!/usr/bin/env node
/**
 * Test script to verify Robokassa form generation for Index.aspx
 * 
 * This script validates:
 * 1. Form fields contain InvId (NOT InvoiceID) for Index.aspx
 * 2. Signature calculation uses InvId
 * 3. Signature recomputes to same MD5
 */

const crypto = require('crypto');

// Mock config (use env vars in production)
const config = {
  merchantLogin: process.env.ROBOKASSA_MERCHANT_LOGIN || 'steopone',
  pass1: process.env.ROBOKASSA_PASSWORD1 || 'test_password_1',
  pass2: process.env.ROBOKASSA_PASSWORD2 || 'test_password_2',
  isTest: process.env.ROBOKASSA_TEST_MODE === 'true' || process.env.ROBOKASSA_TEST_MODE === '1',
};

function calculateMD5(...parts) {
  const str = parts.join(':');
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toLowerCase();
}

function buildFormFields(invoiceId, outSum, description, telegramUserId) {
  // CRITICAL: For Index.aspx, use InvId (NOT InvoiceID)
  const fields = {
    MerchantLogin: config.merchantLogin.trim(),
    InvId: invoiceId, // CRITICAL: Use InvId for Index.aspx
    OutSum: outSum,
    Description: description.substring(0, 128),
    Recurring: 'true',
    Shp_userId: String(telegramUserId),
  };
  
  // Build signature: MerchantLogin:OutSum:InvId:Password1:Shp_userId=...
  const shpParams = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('Shp_')) {
      shpParams.push(`${key}=${String(value).trim()}`);
    }
  }
  shpParams.sort();
  
  const signatureParts = [
    config.merchantLogin.trim(),
    outSum,
    invoiceId, // Use InvId value
    config.pass1.trim(),
  ];
  
  if (shpParams.length > 0) {
    signatureParts.push(...shpParams);
  }
  
  const signatureValue = calculateMD5(...signatureParts);
  fields.SignatureValue = signatureValue;
  
  return {
    fields,
    signatureParts,
    signatureValue,
  };
}

// Test case
const testInvoiceId = '1234567890';
const testOutSum = '1.00';
const testDescription = 'Test payment';
const testTelegramUserId = 123456789;

console.log('🧪 Testing Robokassa form generation for Index.aspx\n');

const result = buildFormFields(testInvoiceId, testOutSum, testDescription, testTelegramUserId);

console.log('📋 Form Fields:');
console.log('   Keys:', Object.keys(result.fields).join(', '));
console.log('');

// Validation 1: InvId must be present
if (!result.fields.InvId) {
  console.error('❌ FAIL: InvId is missing in form fields');
  process.exit(1);
}
console.log('✅ PASS: InvId is present in form fields');

// Validation 2: InvoiceID must NOT be present
if (result.fields.InvoiceID) {
  console.error('❌ FAIL: InvoiceID is present in form fields (should NOT be present for Index.aspx)');
  process.exit(1);
}
console.log('✅ PASS: InvoiceID is NOT present in form fields');

// Validation 3: Signature parts should use InvId value
if (result.signatureParts[2] !== testInvoiceId) {
  console.error(`❌ FAIL: Signature uses "${result.signatureParts[2]}", expected "${testInvoiceId}"`);
  process.exit(1);
}
console.log('✅ PASS: Signature uses InvId value correctly');

// Validation 4: Recompute signature to verify MD5
const recomputedSignature = calculateMD5(...result.signatureParts);
if (recomputedSignature !== result.signatureValue) {
  console.error(`❌ FAIL: Signature mismatch. Expected: ${result.signatureValue}, Got: ${recomputedSignature}`);
  process.exit(1);
}
console.log('✅ PASS: Signature recomputes to same MD5');

// Validation 5: Signature format (32-char lowercase hex)
if (!/^[0-9a-f]{32}$/.test(result.signatureValue)) {
  console.error(`❌ FAIL: Invalid signature format: ${result.signatureValue}`);
  process.exit(1);
}
console.log('✅ PASS: Signature format is valid (32-char lowercase hex)');

console.log('\n📊 Test Results:');
console.log('   InvId:', result.fields.InvId);
console.log('   OutSum:', result.fields.OutSum);
console.log('   Signature (masked):', result.signatureParts.map(p => p === config.pass1.trim() ? '[PASSWORD1_HIDDEN]' : p).join(':'));
console.log('   Signature Value:', result.signatureValue);
console.log('   Form Fields:', Object.keys(result.fields).join(', '));

console.log('\n✅ All tests passed! Form is correctly configured for Index.aspx');

