#!/usr/bin/env node

/**
 * Test script to verify Robokassa signature configuration
 * Run: node test-robokassa-signature.js
 */

const https = require('https');
const http = require('http');

// Get URL from command line or use default
const baseUrl = process.argv[2] || 'https://step-one-app-emins-projects-4717eabc.vercel.app';

console.log('🔍 Testing Robokassa Signature Configuration');
console.log('==========================================\n');
console.log(`Testing URL: ${baseUrl}\n`);

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function testDebugSignature() {
  console.log('1️⃣ Testing /api/robokassa/debug-signature endpoint...\n');
  
  try {
    const url = `${baseUrl}/api/robokassa/debug-signature`;
    const result = await makeRequest(url);
    
    if (result.status === 200 && result.data.ok) {
      console.log('✅ Endpoint is accessible');
      console.log(`   Variant: ${result.data.variant}`);
      console.log(`   Include Receipt: ${result.data.includeReceiptInSignature}`);
      console.log(`   Signature Format: ${result.data.signatureFormat}`);
      console.log(`   Merchant Login: ${result.data.merchantLogin}`);
      console.log(`   Is Test: ${result.data.isTest}`);
      console.log(`   Environment: ${result.data.env}`);
      console.log(`   Note: ${result.data.note}\n`);
      
      // Validate
      if (result.data.variant === 'without-receipt' && !result.data.includeReceiptInSignature) {
        console.log('✅ CORRECT: Receipt is NOT included in signature (default, recommended)');
      } else if (result.data.variant === 'with-receipt' && result.data.includeReceiptInSignature) {
        console.log('⚠️  WARNING: Receipt IS included in signature (may cause Error 29)');
        console.log('   Set ROBOKASSA_INCLUDE_RECEIPT_IN_SIGNATURE=false or remove it');
      } else {
        console.log('❌ INCONSISTENT: Variant and includeReceiptInSignature do not match');
      }
      
      if (result.data.merchantLogin === 'steopone') {
        console.log('✅ Merchant Login is correct: steopone');
      } else {
        console.log(`❌ Merchant Login is incorrect: ${result.data.merchantLogin} (should be "steopone")`);
      }
      
      return result.data;
    } else {
      console.log(`❌ Endpoint returned error:`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error testing endpoint:`, error.message);
    return null;
  }
}

async function testVersion() {
  console.log('\n2️⃣ Testing /api/version endpoint...\n');
  
  try {
    const url = `${baseUrl}/api/version`;
    const result = await makeRequest(url);
    
    if (result.status === 200) {
      console.log('✅ Version endpoint is accessible');
      console.log(`   Git SHA: ${result.data.gitSha}`);
      console.log(`   Environment: ${result.data.env}`);
      console.log(`   Deployed At: ${result.data.deployedAt}\n`);
      return result.data;
    } else {
      console.log(`❌ Version endpoint returned error:`, result);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error testing version endpoint:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Starting tests...\n');
  
  const debugResult = await testDebugSignature();
  const versionResult = await testVersion();
  
  console.log('\n==========================================');
  console.log('📊 Summary');
  console.log('==========================================\n');
  
  if (debugResult) {
    if (debugResult.variant === 'without-receipt' && !debugResult.includeReceiptInSignature) {
      console.log('✅ Signature configuration is CORRECT');
      console.log('   Receipt is NOT included in signature (default)');
      console.log('   This should fix Error 29\n');
    } else {
      console.log('❌ Signature configuration needs attention');
      console.log('   Receipt IS included in signature');
      console.log('   This may cause Error 29\n');
    }
  } else {
    console.log('⚠️  Could not verify signature configuration');
  }
  
  if (versionResult) {
    console.log(`✅ Deployment info: ${versionResult.gitSha} (${versionResult.env})`);
  }
  
  console.log('\n💡 Next steps:');
  console.log('   1. Test parent payment (trial) in Mini App');
  console.log('   2. Check Vercel logs for signature variant');
  console.log('   3. Verify Error 29 is gone\n');
}

main().catch(console.error);

