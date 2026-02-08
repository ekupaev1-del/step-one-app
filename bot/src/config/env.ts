import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getBotSupabaseEnv } from "../lib/supabase/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env из корня папки bot/
dotenv.config({ path: join(__dirname, "../../.env") });

interface EnvConfig {
  telegramBotToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
}

function validateEnv(): EnvConfig {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const missing: string[] = [];

  if (!telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    console.error("❌ Ошибка: отсутствуют переменные окружения:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nСоздайте файл .env в папке bot/ на основе .env.example");
    process.exit(1);
  }

  // Use single source of truth from lib/supabase/env
  // This validates URL, project ref, and logs safe diagnostics
  const supabaseEnv = getBotSupabaseEnv();

  // Проверяем, что ключи не заглушки
  if (openaiApiKey === "sk-your-openai-api-key-here") {
    console.error("❌ OPENAI_API_KEY содержит заглушку! Замените на реальный ключ в bot/.env");
    process.exit(1);
  }

  if (telegramBotToken === "your-telegram-bot-token-here") {
    console.error("❌ TELEGRAM_BOT_TOKEN содержит заглушку! Замените на реальный токен в bot/.env");
    process.exit(1);
  }

  console.log("✅ Environment validation passed");

  return {
    telegramBotToken: telegramBotToken!,
    supabaseUrl: supabaseEnv.url,
    supabaseServiceRoleKey: supabaseEnv.serviceKey,
    openaiApiKey: openaiApiKey!,
  };
}

export const env = validateEnv();
