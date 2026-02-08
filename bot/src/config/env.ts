import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
// @ts-ignore - root lib is outside bot scope
import { getSupabaseServerConfig, logSupabaseConfig } from "../../../lib/supabase-config";

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

// Validation is now handled by shared config module

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

  // Use shared config module (single source of truth)
  // This validates URL and key, and logs safe diagnostics
  const supabaseConfig = getSupabaseServerConfig();
  logSupabaseConfig(supabaseConfig, 'bot');

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
    supabaseUrl: supabaseConfig.url,
    supabaseServiceRoleKey: supabaseConfig.serviceRoleKey,
    openaiApiKey: openaiApiKey!,
  };
}

export const env = validateEnv();
