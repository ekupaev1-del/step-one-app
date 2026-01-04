#!/usr/bin/env node

/**
 * Debug script for Robokassa Error 29
 * Checks configuration and signature format
 */

const https = require('https');
const http = require('http');

const baseUrl = process.argv[2] || 'https://step-one-app-emins-projects-4717eabc.vercel.app';

console.log('🔍 Debugging Robokassa Error 29');
console.log('================================\n');

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function checkConfiguration() {
  console.log('1️⃣ Checking configuration...\n');
  
  try {
    const result = await makeRequest(`${baseUrl}/api/robokassa/debug-signature`);
    
    if (result.status === 200 && result.data.ok) {
      console.log('✅ Configuration check:');
      console.log(`   Merchant Login: ${result.data.merchantLogin}`);
      console.log(`   Is Test: ${result.data.isTest}`);
      console.log(`   Variant: ${result.data.variant}`);
      console.log(`   Include Receipt: ${result.data.includeReceiptInSignature}`);
      console.log(`   Signature Format: ${result.data.signatureFormat}\n`);
      
      // Check for common issues
      const issues = [];
      
      if (result.data.merchantLogin !== 'steopone') {
        issues.push(`❌ Merchant Login is "${result.data.merchantLogin}" but should be "steopone"`);
      }
      
      if (result.data.variant !== 'without-receipt') {
        issues.push(`❌ Variant is "${result.data.variant}" but should be "without-receipt"`);
      }
      
      if (result.data.includeReceiptInSignature) {
        issues.push(`❌ Receipt IS included in signature (should be false)`);
      }
      
      if (issues.length > 0) {
        console.log('⚠️  Issues found:');
        issues.forEach(issue => console.log(`   ${issue}`));
        console.log('');
      } else {
        console.log('✅ Configuration looks correct\n');
      }
      
      return result.data;
    } else {
      console.log('❌ Could not check configuration:', result);
      return null;
    }
  } catch (error) {
    console.log('❌ Error checking configuration:', error.message);
    return null;
  }
}

async function checkVersion() {
  console.log('2️⃣ Checking deployment version...\n');
  
  try {
    const result = await makeRequest(`${baseUrl}/api/version`);
    
    if (result.status === 200) {
      console.log(`   Git SHA: ${result.data.gitSha}`);
      console.log(`   Environment: ${result.data.env}`);
      console.log(`   Deployed At: ${result.data.deployedAt}\n`);
      
      // Check if it's the latest commit with the fix
      if (result.data.gitSha === '89586d2' || result.data.gitSha.startsWith('89586d2')) {
        console.log('✅ Latest fix is deployed\n');
      } else {
        console.log('⚠️  May not be the latest version with Error 29 fix');
        console.log('   Expected commit: 89586d2\n');
      }
      
      return result.data;
    } else {
      console.log('❌ Could not check version:', result);
      return null;
    }
  } catch (error) {
    console.log('❌ Error checking version:', error.message);
    return null;
  }
}

function printTroubleshooting() {
  console.log('================================');
  console.log('🔧 Troubleshooting Steps');
  console.log('================================\n');
  
  console.log('1. Проверьте, что переменные применены:');
  console.log('   - Vercel Dashboard → Deployments → последний деплой');
  console.log('   - Убедитесь, что деплой был ПОСЛЕ добавления переменных');
  console.log('   - Если нет - сделайте Redeploy\n');
  
  console.log('2. Проверьте соответствие Password1 и TEST_MODE:');
  console.log('   - Если ROBOKASSA_TEST_MODE=false → используйте ПРОДАКШН Password1');
  console.log('   - Если ROBOKASSA_TEST_MODE=true → используйте ТЕСТОВЫЙ Password1');
  console.log('   - ⚠️  Это самая частая причина Error 29!\n');
  
  console.log('3. Проверьте Password1 в Robokassa кабинете:');
  console.log('   - Зайдите в Robokassa → Настройки → Технические настройки');
  console.log('   - Для Production: используйте ПРОДАКШН Пароль #1');
  console.log('   - Для Preview/Test: используйте ТЕСТОВЫЙ Пароль #1');
  console.log('   - Убедитесь, что пароль в Vercel совпадает с паролем в кабинете\n');
  
  console.log('4. Проверьте формат подписи в логах:');
  console.log('   - Vercel Dashboard → Deployments → выберите деплой → Logs');
  console.log('   - Найдите строку: "exactSignatureStringMasked"');
  console.log('   - Должно быть: "steopone:1.00:InvId:[PASSWORD1]:Shp_userId=..."');
  console.log('   - НЕ должно быть Receipt между InvId и Password1\n');
  
  console.log('5. Очистите кеш:');
  console.log('   - Закройте Telegram Mini App полностью');
  console.log('   - Откройте заново');
  console.log('   - Или используйте инкогнито режим\n');
  
  console.log('6. Проверьте, что используется правильный домен:');
  console.log(`   - Текущий: ${baseUrl}`);
  console.log('   - Убедитесь, что это Production домен, а не Preview\n');
}

async function main() {
  const config = await checkConfiguration();
  const version = await checkVersion();
  
  console.log('================================');
  console.log('📊 Summary');
  console.log('================================\n');
  
  if (config) {
    if (config.variant === 'without-receipt' && !config.includeReceiptInSignature) {
      console.log('✅ Signature format is CORRECT');
      console.log('   Receipt is NOT in signature\n');
      
      console.log('⚠️  Since Error 29 persists, likely causes:');
      console.log('   1. Password1 mismatch (test vs production)');
      console.log('   2. TEST_MODE and Password1 don\'t match');
      console.log('   3. Old deployment (variables not applied)\n');
    } else {
      console.log('❌ Signature format issue detected');
      console.log('   Check configuration above\n');
    }
  }
  
  printTroubleshooting();
  
  console.log('💡 Next steps:');
  console.log('   1. Check Vercel logs for exact signature string');
  console.log('   2. Verify Password1 matches Robokassa cabinet');
  console.log('   3. Ensure TEST_MODE and Password1 are consistent');
  console.log('   4. Redeploy if variables were added recently\n');
}

main().catch(console.error);

