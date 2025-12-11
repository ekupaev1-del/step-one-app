#!/usr/bin/env node

/**
 * Скрипт для получения последнего preview URL из Vercel API
 * Использует Vercel API для получения последнего deployment для ветки dev
 */

const https = require('https');

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_ID_DEV;
const BRANCH = 'dev';

if (!VERCEL_TOKEN) {
  console.error('❌ VERCEL_TOKEN не установлен');
  process.exit(1);
}

if (!VERCEL_PROJECT_ID) {
  console.error('❌ VERCEL_PROJECT_ID не установлен');
  process.exit(1);
}

function makeVercelRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vercel.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Ошибка парсинга JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`Vercel API вернул статус ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function getLatestPreviewUrl() {
  try {
    // Получаем список deployments для проекта
    // Используем фильтр по target=preview и сортировку по created (новые первыми)
    const deployments = await makeVercelRequest(
      `/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=preview&limit=20`
    );

    if (!deployments || !deployments.deployments || deployments.deployments.length === 0) {
      console.error('⚠️ Deployments не найдены');
      return null;
    }

    // Ищем deployment для ветки dev
    // Vercel создает URL вида: project-git-branch-username.vercel.app
    const devDeployment = deployments.deployments.find(
      (deployment) => {
        const gitRef = deployment.gitSource?.ref;
        const url = deployment.url || '';
        
        // Проверяем по git ref
        if (gitRef === BRANCH) {
          return true;
        }
        
        // Проверяем по URL паттерну (git-dev-...)
        if (url.includes(`git-${BRANCH}`) || url.includes(`-${BRANCH}-`)) {
          return true;
        }
        
        return false;
      }
    );

    if (!devDeployment) {
      console.error(`⚠️ Deployment для ветки ${BRANCH} не найден`);
      console.error(`Найдено deployments: ${deployments.deployments.length}`);
      // Возвращаем последний preview deployment как fallback
      const lastDeployment = deployments.deployments[0];
      if (lastDeployment && lastDeployment.url) {
        const fallbackUrl = `https://${lastDeployment.url}`;
        console.log(`⚠️ Используем последний preview как fallback: ${fallbackUrl}`);
        return { url: fallbackUrl };
      }
      return null;
    }

    // Проверяем статус deployment
    if (devDeployment.readyState !== 'READY') {
      console.error(`⚠️ Deployment еще не готов (статус: ${devDeployment.readyState})`);
      return null;
    }

    const previewUrl = `https://${devDeployment.url}`;
    
    console.log(`✅ Найден preview URL для ${BRANCH}: ${previewUrl}`);
    console.log(`   Deployment ID: ${devDeployment.uid}`);
    console.log(`   Created: ${devDeployment.createdAt}`);
    
    return { url: previewUrl };
  } catch (error) {
    console.error('❌ Ошибка получения preview URL:', error.message);
    return null;
  }
}

// Запускаем скрипт
getLatestPreviewUrl()
  .then((result) => {
    if (result) {
      console.log(JSON.stringify(result));
    } else {
      console.log(JSON.stringify({ url: null }));
    }
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
