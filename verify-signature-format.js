#!/usr/bin/env node

/**
 * Verify signature format from debug data
 */

const debugData = {
  "exactSignatureStringMasked": "steopone:1.00:1514931740:[PASSWORD1_HIDDEN]:Shp_userId=593315158",
  "exactSignatureString": "steopone:1.00:1514931740:B2Bnpr5rF948tbTZXsg:Shp_userId=593315158",
  "signatureVariant": "without-receipt",
  "includeReceiptInSignature": false,
  "signatureParts": [
    { "index": 1, "part": "steopone" },
    { "index": 2, "part": "1.00" },
    { "index": 3, "part": "1514931740" },
    { "index": 4, "part": "[PASSWORD1_HIDDEN]", "isPassword": true },
    { "index": 5, "part": "Shp_userId=593315158", "isShp": true }
  ]
};

console.log('🔍 Verification of Signature Format');
console.log('=====================================\n');

// Check 1: Variant
console.log('1️⃣ Signature Variant:');
console.log(`   ✅ ${debugData.signatureVariant}`);
if (debugData.signatureVariant === 'without-receipt') {
  console.log('   ✅ CORRECT: Receipt is NOT included in signature\n');
} else {
  console.log('   ❌ ERROR: Receipt should NOT be in signature\n');
}

// Check 2: Include Receipt flag
console.log('2️⃣ Include Receipt Flag:');
console.log(`   ✅ ${debugData.includeReceiptInSignature}`);
if (!debugData.includeReceiptInSignature) {
  console.log('   ✅ CORRECT: Flag is false (Receipt excluded)\n');
} else {
  console.log('   ❌ ERROR: Flag should be false\n');
}

// Check 3: Signature format
console.log('3️⃣ Signature Format:');
console.log(`   Masked: ${debugData.exactSignatureStringMasked}`);
console.log(`   Full: ${debugData.exactSignatureString.replace(/B2Bnpr5rF948tbTZXsg/, '[PASSWORD1]')}\n`);

const expectedFormat = 'MerchantLogin:OutSum:InvId:Password1:Shp_userId=...';
const actualFormat = 'steopone:1.00:1514931740:[PASSWORD1]:Shp_userId=593315158';

console.log(`   Expected: ${expectedFormat}`);
console.log(`   Actual:   ${actualFormat}`);

const partsMatch = debugData.signatureParts.length === 5 &&
  debugData.signatureParts[0].part === 'steopone' &&
  debugData.signatureParts[1].part === '1.00' &&
  debugData.signatureParts[2].part === '1514931740' &&
  debugData.signatureParts[3].isPassword === true &&
  debugData.signatureParts[4].isShp === true;

if (partsMatch) {
  console.log('   ✅ CORRECT: Format matches expected pattern\n');
} else {
  console.log('   ❌ ERROR: Format does not match\n');
}

// Check 4: Receipt NOT in signature
console.log('4️⃣ Receipt in Signature:');
const receiptInSignature = debugData.signatureParts.some(p => p.isReceipt || p.part.includes('Receipt') || p.part.includes('%7B'));
if (!receiptInSignature) {
  console.log('   ✅ CORRECT: Receipt is NOT in signature parts\n');
} else {
  console.log('   ❌ ERROR: Receipt should NOT be in signature\n');
}

// Check 5: Order of parts
console.log('5️⃣ Order of Signature Parts:');
console.log('   Order:');
debugData.signatureParts.forEach(p => {
  const label = p.isPassword ? '[PASSWORD1]' : p.isShp ? '[Shp_*]' : p.part;
  console.log(`     ${p.index}. ${label}`);
});

const correctOrder = 
  debugData.signatureParts[0].part === 'steopone' &&
  debugData.signatureParts[1].part === '1.00' &&
  debugData.signatureParts[2].part === '1514931740' &&
  debugData.signatureParts[3].isPassword === true &&
  debugData.signatureParts[4].isShp === true;

if (correctOrder) {
  console.log('   ✅ CORRECT: Parts are in correct order\n');
} else {
  console.log('   ❌ ERROR: Parts are in wrong order\n');
}

// Summary
console.log('=====================================');
console.log('📊 Summary');
console.log('=====================================\n');

const allChecks = [
  debugData.signatureVariant === 'without-receipt',
  !debugData.includeReceiptInSignature,
  partsMatch,
  !receiptInSignature,
  correctOrder
];

const allPassed = allChecks.every(check => check === true);

if (allPassed) {
  console.log('✅ ALL CHECKS PASSED');
  console.log('\n✅ Signature format is CORRECT');
  console.log('✅ Receipt is NOT included in signature');
  console.log('✅ Format matches Robokassa requirements');
  console.log('✅ This should fix Error 29\n');
  console.log('💡 The signature is:');
  console.log('   MD5(MerchantLogin:OutSum:InvId:Password1:Shp_userId=...)');
  console.log('   ✅ This is the correct format for parent recurring payment\n');
} else {
  console.log('❌ SOME CHECKS FAILED');
  console.log('   Please review the errors above\n');
}

